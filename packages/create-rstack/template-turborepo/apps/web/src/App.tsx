import { Button } from '@repo/ui/button';

export function App() {
  return (
    <main>
      <h1>Web</h1>
      <p>Turborepo + Rstack CLI</p>
      <p>Edit apps/web/src/App.tsx to get started.</p>
      <Button onClick={() => window.alert('Hello from @repo/ui!')}>
        Shared button
      </Button>
      <nav>
        <a href="https://rstack.rs">Rstack documentation</a>
      </nav>
    </main>
  );
}
