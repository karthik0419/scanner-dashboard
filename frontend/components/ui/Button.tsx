'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
      secondary: 'bg-bg-hover text-text-primary hover:bg-gray-200 border border-border',
      outline: 'border border-border-strong bg-white hover:bg-bg-hover text-text-secondary hover:text-text-primary',
      ghost: 'bg-transparent hover:bg-bg-hover text-text-tertiary hover:text-text-primary',
      danger: 'bg-danger text-white hover:bg-danger-muted shadow-sm',
    };
    const sizes = {
      sm: 'h-8 px-3 text-xs font-medium rounded-lg gap-1.5',
      md: 'h-10 px-4 text-sm font-medium rounded-lg gap-2',
      lg: 'h-12 px-6 text-base font-semibold rounded-xl gap-2',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 active:scale-[0.98]',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className="h-4 w-4" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
