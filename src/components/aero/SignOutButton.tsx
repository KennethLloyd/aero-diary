import { logout } from '@/actions/auth';

export function SignOutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="aero-btn-base aero-btn-danger aero-btn-md"
      >
        Sign out
      </button>
    </form>
  );
}
