'use client';

import {AuthScreen} from '@/features/auth/AuthScreen';
import {AppErrorBoundary} from '@/features/shared/AppErrorBoundary';
import {AppShell} from '@/features/shell/AppShell';
import {useAppController} from '@/features/shell/useAppController';

export default function Page() {
  const {authenticated, authScreenProps, shellProps} = useAppController();
  // console.log(authenticated,'authenticated')
  if (!authenticated) {
    return (
      <AppErrorBoundary>
        <AuthScreen {...authScreenProps} />
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <AppShell {...shellProps} />
    </AppErrorBoundary>
  );
}
