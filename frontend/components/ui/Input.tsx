import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary',
        'placeholder:text-text-tertiary',
        'transition-colors duration-150',
        'hover:border-border-strong',
        'focus:border-accent focus:ring-2 focus:ring-accent/15',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Label = ({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className={cn('block text-xs font-medium text-text-tertiary mb-1.5 uppercase tracking-wide', className)}>
    {children}
  </label>
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary',
        'transition-colors duration-150 hover:border-border-strong',
        'focus:border-accent focus:ring-2 focus:ring-accent/15',
        'disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
