'use server';
import { redirect } from 'next/navigation';
export async function updateMembership(_formData: FormData): Promise<{ success: boolean; message?: string }> { void _formData; redirect('/join'); }
