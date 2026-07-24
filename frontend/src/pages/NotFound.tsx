import { Link } from "react-router-dom";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/Button";

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-6 rounded-full bg-muted p-6">
          <Crosshair className="h-14 w-14 text-primary/50" />
        </div>
        <h1 className="mb-2 font-mono text-8xl font-bold tracking-tighter text-primary/30">
          404
        </h1>
        <h2 className="mb-2 font-mono text-lg font-bold tracking-wide text-foreground">
          Page not found
        </h2>
        <p className="mb-8 max-w-md text-center font-mono text-sm text-muted-foreground">
          The target you&apos;re looking for is out of scan range. Return to base and try again.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/dashboard">
              <Crosshair className="mr-2 h-4 w-4" />
              Return to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-border text-foreground">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
