import { DEMO_USER_IDS, type DemoUserId } from '../api/client.js';
import { useAuth } from './AuthProvider.js';

const DEMO_USER_LABELS: Readonly<Record<DemoUserId, string>> = {
  'demo-student': 'Demo student',
  'demo-admin': 'Demo administrator',
  'demo-captain': 'Demo team captain',
  'demo-sports-lead': 'Demo sports lead',
};

export function DemoUserSwitcher() {
  const { authMode, demoUser, setDemoUser } = useAuth();
  if (authMode !== 'demo' || demoUser === null) return null;

  return (
    <label>
      <span>Demo user</span>
      <select
        aria-label="Demo user"
        value={demoUser}
        onChange={(event) => setDemoUser(event.currentTarget.value)}
      >
        {DEMO_USER_IDS.map((userId) => (
          <option key={userId} value={userId}>
            {DEMO_USER_LABELS[userId]}
          </option>
        ))}
      </select>
    </label>
  );
}
