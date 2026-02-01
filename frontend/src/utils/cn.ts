import { clsx, type ClassValue } from 'clsx'

/**
 * Utility function to merge class names using clsx
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
