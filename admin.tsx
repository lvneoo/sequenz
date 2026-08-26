import React from 'react';
import { requireAuthenticatedUserId } from '@/utils/auth/user';

export default async function Admin(): Promise<JSX.Element> {
  await requireAuthenticatedUserId();
  return <div>Admin</div>;
}

