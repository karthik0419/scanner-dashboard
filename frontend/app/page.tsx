'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) router.push(user ? '/dashboard' : '/landing');
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-pulse text-text-tertiary">Loading...</div>
    </div>
  );
}
