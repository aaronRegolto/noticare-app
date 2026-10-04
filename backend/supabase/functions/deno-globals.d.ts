// The subset of Deno's runtime API the Edge Functions use, for type checking outside Deno (see
// tsconfig.json in this folder). No function imports this file, so it is never deployed. Add to it
// when a function starts using another Deno API.
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
