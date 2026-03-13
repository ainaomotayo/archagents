import type { SchedulerJob, JobContext } from "./types.js";

export class JobRegistry {
  private jobs = new Map<string, SchedulerJob>();

  register(job: SchedulerJob): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`Job "${job.name}" already registered`);
    }
    this.jobs.set(job.name, job);
  }

  getJob(name: string): SchedulerJob | undefined {
    return this.jobs.get(name);
  }

  getJobs(): SchedulerJob[] {
    return Array.from(this.jobs.values());
  }

  async executeJob(name: string, ctx: JobContext): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Job "${name}" not found`);

    const start = Date.now();
    await ctx.audit.log({
      jobName: name,
      action: "triggered",
      timestamp: new Date().toISOString(),
    });

    try {
      await job.execute(ctx);
      const durationMs = Date.now() - start;
      ctx.metrics.recordTrigger(name);
      await ctx.audit.log({
        jobName: name,
        action: "completed",
        timestamp: new Date().toISOString(),
        detail: { durationMs },
      });
    } catch (err) {
      ctx.metrics.recordError(name);
      await ctx.audit.log({
        jobName: name,
        action: "failed",
        timestamp: new Date().toISOString(),
        detail: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }
}
