[Comments]
Comments should explain intent (the why), not obvious details of what.
Keep them short, consistent, and use the right style per context.

Use /** ... */ (JSDoc) for components, props, and functions.
Use // inline for state choices, usage patterns, or UI logic that may not be obvious.
```typescript
/**
 * Renders a dialog for user login.
 * - Controlled via `open` prop.
 * - Calls `onSubmit` with email+password.
 */
export function LoginDialog({ open, onSubmit }: Props) {
  // State for form inputs (kept local since only used here)
  const [email, setEmail] = useState("");

  // Validate before calling parent submit
  const handleSubmit = () => {
    if (!email) return; // Block empty email
    onSubmit({ email, password });
  };

  return <Dialog open={open}>...</Dialog>;
}
```
