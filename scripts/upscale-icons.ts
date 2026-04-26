/**
 * Upscale PF2e equipment icons 4× using realesrgan-ncnn-vulkan.
 *
 * Run:  npm run upscale-icons -- [flags]
 *       tsx scripts/upscale-icons.ts --help
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PREFIX = '[icon-upscale]';

// Default source directory — the standard Foundry VTT PF2e data layout.
// If this path doesn't exist at runtime, the script exits and asks for --input.
const WELL_KNOWN_INPUT = 'E:/TTRPG/Tools/data/Data/systems/pf2e/icons/equipment';
const DEFAULT_OUTPUT = './output/equipment';
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_BIN = 'realesrgan-ncnn-vulkan';

export interface Config {
  input: string | undefined;
  output: string;
  concurrency: number;
  force: boolean;
  realesrganBin: string;
  help: boolean;
}

export function parseArgs(argv: string[]): Config {
  const args = argv.slice(2);
  const config: Config = {
    input: undefined,
    output: DEFAULT_OUTPUT,
    concurrency: DEFAULT_CONCURRENCY,
    force: false,
    realesrganBin: DEFAULT_BIN,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        config.help = true;
        break;
      case '--input':
        config.input = args[++i];
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--concurrency': {
        const n = parseInt(args[++i], 10);
        if (isNaN(n) || n < 1) {
          console.error(`${LOG_PREFIX} ERROR --concurrency must be a positive integer`);
          process.exit(1);
        }
        config.concurrency = n;
        break;
      }
      case '--force':
        config.force = true;
        break;
      case '--realesrgan-bin':
        config.realesrganBin = args[++i];
        break;
      default:
        console.error(`${LOG_PREFIX} ERROR Unknown flag: ${arg}`);
        process.exit(1);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(
    `
${LOG_PREFIX} Upscale PF2e equipment icons 4× using realesrgan-ncnn-vulkan (model: realesrgan-x4plus-anime).

Usage:
  npm run upscale-icons -- [options]
  tsx scripts/upscale-icons.ts [options]

Options:
  --input <dir>             Source directory of .webp/.png icons
                            (default: ${WELL_KNOWN_INPUT})
  --output <dir>            Output directory, mirroring the input tree structure
                            (default: ${DEFAULT_OUTPUT})
  --concurrency <n>         Max parallel realesrgan processes (default: ${DEFAULT_CONCURRENCY})
  --force                   Re-upscale even if output exists and is newer than input
  --realesrgan-bin <path>   Path to realesrgan-ncnn-vulkan executable
                            (default: realesrgan-ncnn-vulkan resolved from PATH)
  --help, -h                Show this help

Prerequisites:
  Download realesrgan-ncnn-vulkan from:
    https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases
  Add the extracted directory to your PATH, or pass --realesrgan-bin <path>.
    `.trim(),
  );
}

/** Maps an input file path to its corresponding output .webp path. */
export function outputPathFor(inputFile: string, inputDir: string, outputDir: string): string {
  const rel = relative(inputDir, inputFile);
  const noExt = rel.slice(0, rel.length - extname(rel).length);
  return join(outputDir, noExt + '.webp');
}

/** Minimal stat interface used by shouldSkip — injectable for tests. */
export type StatFn = (path: string) => Promise<{ mtimeMs: number }>;

/**
 * Returns true when the output file exists and is at least as new as the input,
 * meaning a previous run already produced this file.  force=true always returns false.
 */
export async function shouldSkip(
  inputFile: string,
  outputFile: string,
  force: boolean,
  statFn: StatFn = stat,
): Promise<boolean> {
  if (force) return false;
  try {
    const [inStat, outStat] = await Promise.all([statFn(inputFile), statFn(outputFile)]);
    return outStat.mtimeMs >= inStat.mtimeMs;
  } catch {
    // Output missing, or input vanished — don't skip.
    return false;
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(full)));
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ext === '.webp' || ext === '.png') {
        results.push(full);
      }
    }
  }
  return results;
}

function runRealesrgan(bin: string, inputFile: string, outputFile: string): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(bin, [
      '-i',
      inputFile,
      '-o',
      outputFile,
      '-n',
      'realesrgan-x4plus-anime',
      '-s',
      '4',
      '-f',
      'webp',
    ]);
    const stderrChunks: string[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString()));
    child.on('close', (code) => {
      if (code === 0) {
        res();
      } else {
        const tail = stderrChunks.join('').split('\n').slice(-5).join('\n').trim();
        rej(new Error(`exited with code ${code}${tail ? `. stderr: ${tail}` : ''}`));
      }
    });
    child.on('error', rej);
  });
}

/** Runs tasks with at most `concurrency` in flight at a time. */
export async function runWithConcurrency(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  let index = 0;
  const worker = async () => {
    while (index < tasks.length) {
      const i = index++;
      await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv);

  if (config.help) {
    printHelp();
    return;
  }

  // Resolve and verify the input directory.
  let inputDir: string;
  if (config.input !== undefined) {
    try {
      await access(config.input);
    } catch {
      console.error(`${LOG_PREFIX} ERROR Input directory not found: ${config.input}`);
      process.exit(1);
    }
    inputDir = config.input;
  } else {
    try {
      await access(WELL_KNOWN_INPUT);
    } catch {
      console.error(`${LOG_PREFIX} ERROR Default input directory not found: ${WELL_KNOWN_INPUT}`);
      console.error(`${LOG_PREFIX} ERROR Specify the source directory with --input <dir>`);
      process.exit(1);
    }
    inputDir = WELL_KNOWN_INPUT;
  }

  console.info(`${LOG_PREFIX} Input:       ${inputDir}`);
  console.info(`${LOG_PREFIX} Output:      ${config.output}`);
  console.info(`${LOG_PREFIX} Concurrency: ${config.concurrency}`);
  console.info(`${LOG_PREFIX} Force:       ${config.force}`);
  console.info(`${LOG_PREFIX} Binary:      ${config.realesrganBin}`);

  const inputFiles = await walkDir(inputDir);
  console.info(`${LOG_PREFIX} Found ${inputFiles.length} icon file(s) in ${inputDir}`);

  if (inputFiles.length === 0) {
    console.info(`${LOG_PREFIX} Nothing to do.`);
    return;
  }

  const startTime = Date.now();
  let processed = 0;
  let skipped = 0;
  const failures: string[] = [];
  const total = inputFiles.length;

  const tasks = inputFiles.map((inputFile, idx) => async () => {
    const outputFile = outputPathFor(inputFile, inputDir, config.output);
    const relInput = relative(inputDir, inputFile);

    if (await shouldSkip(inputFile, outputFile, config.force)) {
      skipped++;
      return;
    }

    await mkdir(dirname(outputFile), { recursive: true });

    console.info(`${LOG_PREFIX} [${idx + 1}/${total}] ${relInput} -> ${outputFile}`);

    try {
      await runRealesrgan(config.realesrganBin, inputFile, outputFile);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`${LOG_PREFIX} WARN failed ${relInput}: ${msg}`);
      failures.push(relInput);
    }
  });

  await runWithConcurrency(tasks, config.concurrency);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.info(
    `${LOG_PREFIX} Done in ${elapsed}s — processed: ${processed}, skipped: ${skipped}, errors: ${failures.length}`,
  );

  if (failures.length > 0) {
    console.warn(`${LOG_PREFIX} WARN ${failures.length} icon(s) failed:`);
    for (const f of failures) {
      console.warn(`${LOG_PREFIX} WARN   ${f}`);
    }
    process.exitCode = 1;
  }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e: unknown) => {
    console.error(`${LOG_PREFIX} fatal:`, e);
    process.exit(1);
  });
}
