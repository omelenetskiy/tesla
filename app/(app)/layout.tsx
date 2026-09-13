import { AppShell } from '@/components/shell/app-shell'

/** Product shell for the primary product destinations. */
export default function AppGroupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>
}
