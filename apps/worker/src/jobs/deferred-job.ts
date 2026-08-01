export class DeferredJobError extends Error {
  constructor(
    message: string,
    readonly resumeAt: Date,
  ) {
    super(message);
    this.name = "DeferredJobError";
  }
}
