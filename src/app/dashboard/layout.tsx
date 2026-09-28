import RequireAuth from "@/components/auth/RequireAuth";
import UsernameOnboarding from "@/components/auth/UsernameOnboarding";
import IrisShell from "@/mobile/iris/IrisShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      {/* ChemAI: the ☰ menu and the settings sheet around every page. */}
      <IrisShell>{children}</IrisShell>
      <UsernameOnboarding />
    </RequireAuth>
  );
}
