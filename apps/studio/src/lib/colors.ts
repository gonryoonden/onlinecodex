import { z } from 'zod';
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
