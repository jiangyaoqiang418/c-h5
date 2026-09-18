import { realUserRequest } from '../request';

export interface PayPasswordStatus { hasSet: boolean; locked: boolean; lockedUntil?: string | number | null; remainingAttempts: number; updatedAt?: string | number }
export const fetchPayPasswordStatus = () => realUserRequest<PayPasswordStatus>({ url: '/auth/pay-password/status' });
export const setPayPassword = (data: { loginPassword: string; payPassword: string; confirmPayPassword: string }) => realUserRequest<void, typeof data>({ url: '/auth/pay-password/set', method: 'POST', data });
export const updatePayPassword = (data: { oldPayPassword: string; payPassword: string; confirmPayPassword: string }) => realUserRequest<void, typeof data>({ url: '/auth/pay-password/update', method: 'PUT', data });
export const resetPayPassword = (data: { loginPassword: string; payPassword: string; confirmPayPassword: string }) => realUserRequest<void, typeof data>({ url: '/auth/pay-password/reset', method: 'PUT', data });
