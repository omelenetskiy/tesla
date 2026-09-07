import { AppShell } from '@/components/shell/app-shell'

/**
 * Product shell for the four primary destinations plus Settings. `/debug/api` sits
 * outside it on purpose: the console has its own three-pane density and must not
 * inherit the product's navigation (§25).
 */
export default function AppGroupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>
}
