export type UserRole = 'student' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  name?: string;
  startingCapital?: number;
  cash?: number;
  isFrozen?: boolean;
}