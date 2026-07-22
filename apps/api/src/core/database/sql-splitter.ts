export function splitSqlStatements(contents: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let state: 'normal' | 'single' | 'double' | 'backtick' | 'line-comment' | 'block-comment' =
    'normal';
  let atLineStart = true;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index] ?? '';
    const next = contents[index + 1] ?? '';

    if (state === 'normal') {
      if (atLineStart && !/\s/.test(character)) {
        if (/^DELIMITER\b/i.test(contents.slice(index))) {
          throw new Error('DELIMITER directives are not supported by the migration CLI');
        }
        atLineStart = false;
      }
      if (character === '-' && next === '-' && /\s|$/.test(contents[index + 2] ?? '')) {
        state = 'line-comment';
        buffer += character + next;
        index += 1;
        continue;
      }
      if (character === '#') {
        state = 'line-comment';
        buffer += character;
        continue;
      }
      if (character === '/' && next === '*') {
        state = 'block-comment';
        buffer += character + next;
        index += 1;
        continue;
      }
      if (character === "'") state = 'single';
      else if (character === '"') state = 'double';
      else if (character === '`') state = 'backtick';
      else if (character === ';') {
        const statement = buffer.trim();
        if (statement) statements.push(statement);
        buffer = '';
        continue;
      }
    } else if (state === 'line-comment') {
      if (character === '\n') state = 'normal';
    } else if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        buffer += character + next;
        index += 1;
        state = 'normal';
        continue;
      }
    } else {
      const delimiter = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (character === '\\') {
        buffer += character + next;
        index += 1;
        continue;
      }
      if (character === delimiter && next === delimiter) {
        buffer += character + next;
        index += 1;
        continue;
      }
      if (character === delimiter) state = 'normal';
    }

    buffer += character;
    if (character === '\n') atLineStart = true;
    else if (atLineStart && !/\s/.test(character)) atLineStart = false;
  }

  if (
    state === 'single' ||
    state === 'double' ||
    state === 'backtick' ||
    state === 'block-comment'
  ) {
    throw new Error(`Unterminated SQL ${state}`);
  }
  const trailing = buffer.trim();
  if (trailing) statements.push(trailing);
  return statements;
}
