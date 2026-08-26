export default function UnauthorizedPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-xl border bg-background p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Not authorized</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have access to this profile.
        </p>
      </div>
    </div>
  );
}