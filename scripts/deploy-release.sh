#!/usr/bin/env bash

set -Eeuo pipefail
umask 027

usage() {
  printf '%s\n' 'Usage: scripts/deploy-release.sh --archive ARCHIVE.tar.gz --sha 40_HEX_COMMIT_SHA'
}

fail() {
  printf 'Deployment failed: %s\n' "$1" >&2
  return 1
}

archive=
release_sha=
while (($#)); do
  case "$1" in
    --archive)
      (($# >= 2)) || fail '--archive requires a value'
      archive=$2
      shift 2
      ;;
    --sha)
      (($# >= 2)) || fail '--sha requires a value'
      release_sha=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ $release_sha =~ ^[0-9a-fA-F]{40}$ ]] ||
  fail 'SHA must be a 40-character hexadecimal commit identifier'
release_sha=${release_sha,,}
[[ -f $archive ]] || fail 'archive does not exist or is not a regular file'

test_mode=${FREEBBS_TEST_MODE:-0}
installed_hook=/usr/local/sbin/deploy-freebbs-development
if [[ $test_mode == 1 ]]; then
  [[ $(readlink -f "${BASH_SOURCE[0]}") != "$installed_hook" ]] ||
    fail 'test mode is disabled for the installed production hook'
  app_root=${FREEBBS_APP_ROOT:-/opt/freebbs-development}
  web_parent=${FREEBBS_WEB_PARENT:-/usr/share/nginx/html}
  ready_url=${FREEBBS_READY_URL:-http://127.0.0.1:3100/ready}
  web_url=${FREEBBS_WEB_URL:-http://127.0.0.1/development/}
  ready_attempts=${FREEBBS_READY_ATTEMPTS:-30}
  ready_delay=${FREEBBS_READY_DELAY:-1}
  tar_bin=${FREEBBS_TAR_BIN:-tar}
  npm_bin=${FREEBBS_NPM_BIN:-npm}
  nginx_bin=${FREEBBS_NGINX_BIN:-nginx}
  systemctl_bin=${FREEBBS_SYSTEMCTL_BIN:-systemctl}
  curl_bin=${FREEBBS_CURL_BIN:-curl}
  realpath_bin=${FREEBBS_REALPATH_BIN:-realpath}
else
  [[ $EUID -eq 0 ]] || fail 'deployment hook must run as root'
  app_root=/opt/freebbs-development
  web_parent=/usr/share/nginx/html
  ready_url=http://127.0.0.1:3100/ready
  web_url=http://127.0.0.1/development/
  ready_attempts=30
  ready_delay=1
  tar_bin=/usr/bin/tar
  npm_bin=/usr/bin/npm
  nginx_bin=/usr/sbin/nginx
  systemctl_bin=/usr/bin/systemctl
  curl_bin=/usr/bin/curl
  realpath_bin=/usr/bin/realpath
fi

[[ $ready_attempts =~ ^[1-9][0-9]*$ ]] || fail 'FREEBBS_READY_ATTEMPTS must be positive'
[[ $ready_delay =~ ^[0-9]+([.][0-9]+)?$ ]] || fail 'FREEBBS_READY_DELAY must be non-negative'

releases="$app_root/releases"
current_link="$app_root/current"
web_link="$web_parent/development"
staging="$releases/$release_sha.staging"
release_directory="$releases/$release_sha"
lock_file="$app_root/deploy.lock"

mkdir -p -- "$releases" "$web_parent"
exec 9>"$lock_file"
flock -n 9 || fail 'another deployment is already running'
[[ ! -e $staging ]] || fail 'staging directory already exists'
[[ ! -e $release_directory ]] || fail 'immutable release directory already exists'

old_current=
old_web=
current_existed=false
web_existed=false
if [[ -L $current_link ]]; then
  old_current=$(readlink "$current_link")
  current_existed=true
elif [[ -e $current_link ]]; then
  fail 'current path exists but is not a symbolic link'
fi
if [[ -L $web_link ]]; then
  old_web=$(readlink "$web_link")
  web_existed=true
elif [[ -e $web_link ]]; then
  fail 'web path exists but is not a symbolic link'
fi

published=false
current_switch_started=false
web_switch_started=false
incoming_archive=
atomic_link_count=0

atomic_link() {
  local target=$1
  local link=$2
  local temporary="$link.next.$$"
  ((atomic_link_count += 1))
  if [[ $test_mode == 1 && ${FREEBBS_FAIL_PHASE:-} == static-link && $atomic_link_count -eq 2 ]]; then
    return 51
  fi
  ln -s -- "$target" "$temporary"
  if ! mv -Tf -- "$temporary" "$link"; then
    rm -f -- "$temporary"
    return 1
  fi
}

restore_link() {
  local existed=$1
  local target=$2
  local link=$3
  if [[ $existed == true ]]; then
    atomic_link "$target" "$link"
  else
    rm -f -- "$link"
  fi
}

rollback() {
  local status=${1:-$?}
  ((status != 0)) || status=1
  trap - ERR EXIT HUP INT TERM
  if [[ $current_switch_started == true ]]; then
    restore_link "$current_existed" "$old_current" "$current_link" || true
  fi
  if [[ $web_switch_started == true ]]; then
    restore_link "$web_existed" "$old_web" "$web_link" || true
  fi
  if [[ $current_switch_started == true || $web_switch_started == true ]]; then
    "$systemctl_bin" restart freebbs-development-api.service >/dev/null 2>&1 || true
    "$systemctl_bin" reload nginx.service >/dev/null 2>&1 || true
    "$systemctl_bin" restart freebbs-development-web.service >/dev/null 2>&1 || true
  fi
  rm -rf -- "$staging"
  rm -f -- "$incoming_archive"
  if [[ $published == true ]]; then
    rm -rf -- "$release_directory"
  fi
  printf '%s\n' 'Deployment rolled back; the previous release remains selected.' >&2
  exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' HUP INT TERM

incoming_archive="$app_root/incoming.$$.tar.gz"
install -m 0600 -- "$archive" "$incoming_archive"
archive=$incoming_archive

# Inspect member names before extraction. Backslashes are rejected because their
# interpretation differs across tooling. Control characters are never valid.
while IFS= read -r entry; do
  [[ -n $entry ]] || fail 'archive contains an empty member name'
  [[ $entry != /* && $entry != *\\* ]] || fail 'archive contains an unsafe absolute path'
  [[ ! $entry =~ (^|/)\.\.(/|$) ]] || fail 'archive contains a parent traversal path'
  if printf '%s' "$entry" | LC_ALL=C grep '[[:cntrl:]]' >/dev/null; then
    fail 'archive contains a control-character member name'
  fi
done < <("$tar_bin" -tzf "$archive")

while IFS= read -r details; do
  [[ -n $details ]] || fail 'archive contains invalid metadata'
  case ${details:0:1} in
    -|d|l|h) ;;
    *) fail 'archive contains a special device or unsupported member type' ;;
  esac
done < <("$tar_bin" -tvzf "$archive")

mkdir -- "$staging"
"$tar_bin" -xzf "$archive" --no-same-owner --no-same-permissions -C "$staging"

while IFS= read -r -d '' member; do
  relative=${member#"$staging"/}
  if printf '%s' "$relative" | LC_ALL=C grep '[[:cntrl:]]' >/dev/null; then
    fail 'archive contains a control-character member name'
  fi
done < <(find "$staging" -mindepth 1 -print0)

while IFS= read -r -d '' link; do
  target=$(readlink "$link")
  if printf '%s' "$target" | LC_ALL=C grep '[[:cntrl:]]' >/dev/null; then
    fail 'archive contains a control-character symbolic-link target'
  fi
  [[ $target != /* ]] || fail 'archive contains an absolute symbolic-link target'
  resolved=$("$realpath_bin" -m "$(dirname "$link")/$target")
  case "$resolved" in
    "$staging"|"$staging"/*) ;;
    *) fail 'archive contains an escaping symbolic link' ;;
  esac
done < <(find "$staging" -type l -print0)

[[ -f $staging/.release-sha ]] || fail 'archive is missing .release-sha'
mapfile -t embedded_sha <"$staging/.release-sha"
[[ ${#embedded_sha[@]} -eq 1 && ${embedded_sha[0]} == "$release_sha" ]] ||
  fail '.release-sha does not match the requested release'

(
  cd "$staging"
  "$npm_bin" ci --ignore-scripts
  "$npm_bin" run build
  "$npm_bin" prune --omit=dev --ignore-scripts
)
[[ -r $staging/apps/api/dist/server.js ]] || fail 'API production build is missing'
[[ -r $staging/apps/web/dist/index.html ]] || fail 'Web production build is missing'
# Releases contain no secrets and must be traversable by both the API identity and Nginx.
chmod -R u=rwX,go=rX "$staging"

mv -- "$staging" "$release_directory"
published=true
current_switch_started=true
atomic_link "$release_directory" "$current_link"

web_switch_started=true
atomic_link "$release_directory/apps/web/dist" "$web_link"

"$nginx_bin" -t
"$systemctl_bin" restart freebbs-development-api.service
"$systemctl_bin" reload nginx.service
"$systemctl_bin" restart freebbs-development-web.service

ready=false
for ((attempt = 1; attempt <= ready_attempts; attempt++)); do
  if "$curl_bin" --fail --silent --show-error --max-time 5 "$ready_url" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep "$ready_delay"
done
[[ $ready == true ]] || fail 'readiness endpoint did not become healthy'
"$curl_bin" --fail --silent --show-error --max-time 5 "$web_url" >/dev/null

rm -f -- "$incoming_archive"
trap - ERR HUP INT TERM
printf 'Deployment selected release %s\n' "$release_sha"
