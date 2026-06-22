import { Link } from "react-router-dom";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/Button";

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-6 rounded-full bg-muted p-5">
        <Crosshair className="h-12 w-12 text-primary/50" />
      </div>
      <h1 className="mb-2 font-mono text-8xl font-bold tracking-tighter text-muted/20">
        404
      </h1>
      <h2 className="mb-2 font-mono text-lg font-bold tracking-wide text-foreground">
        PAGE NOT FOUND
      </h2>
      <p className="mb-8 max-w-md text-center font-mono text-sm text-muted-foreground">
        The target you&apos;re looking for is out of scan range. Return to base and try again.
      </p>
      <Button asChild size="lg">
        <Link to="/dashboard">
          <Crosshair className="mr-2 h-4 w-4" />
          Return to Dashboard
        </Link>
      </Button>
    </div>
  );
}

export default NotFound;
