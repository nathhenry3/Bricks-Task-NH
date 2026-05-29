export interface TrialExecutionEnvelopeArgs<TContext, TResult> {
  context: TContext;
  execute: (context: TContext) => Promise<TResult>;
  before?: (context: TContext) => Promise<void> | void;
  after?: (context: TContext, result: TResult) => Promise<void> | void;
  onError?: (context: TContext, error: unknown) => Promise<void> | void;
  finalize?: (context: TContext) => Promise<void> | void;
}

export async function runTrialWithEnvelope<TContext, TResult>(
  args: TrialExecutionEnvelopeArgs<TContext, TResult>,
): Promise<TResult> {
  await args.before?.(args.context);
  try {
    const result = await args.execute(args.context);
    await args.after?.(args.context, result);
    return result;
  } catch (error) {
    await args.onError?.(args.context, error);
    throw error;
  } finally {
    await args.finalize?.(args.context);
  }
}
