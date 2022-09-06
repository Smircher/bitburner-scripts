/**
 * Return a formatted representation of the monetary amount using scale symbols (e.g. $6.50M)
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
 export function formatMoney(num, maxSignificantFigures = 6, maxDecimalPlaces = 3) {
    let numberShort = formatNumberShort(num, maxSignificantFigures, maxDecimalPlaces);
    return num >= 0 ? "$" + numberShort : numberShort.replace("-", "-$");
}

const symbols = ["", "k", "m", "b", "t", "q", "Q", "s", "S", "o", "n", "e33", "e36", "e39"];
/**
 * Return a formatted representation of the monetary amount using scale sympols (e.g. 6.50M) 
 * @param {number} num - The number to format
 * @param {number=} maxSignificantFigures - (default: 6) The maximum significant figures you wish to see (e.g. 123, 12.3 and 1.23 all have 3 significant figures)
 * @param {number=} maxDecimalPlaces - (default: 3) The maximum decimal places you wish to see, regardless of significant figures. (e.g. 12.3, 1.2, 0.1 all have 1 decimal)
 **/
export function formatNumberShort(num, maxSignificantFigures = 6, maxDecimalPlaces = 3) {
    if (Math.abs(num) > 10 ** (3 * symbols.length)) // If we've exceeded our max symbol, switch to exponential notation
        return num.toExponential(Math.min(maxDecimalPlaces, maxSignificantFigures - 1));
    for (var i = 0, sign = Math.sign(num), num = Math.abs(num); num >= 1000 && i < symbols.length; i++) num /= 1000;
    // TODO: A number like 9.999 once rounded to show 3 sig figs, will become 10.00, which is now 4 sig figs.
    return ((sign < 0) ? "-" : "") + num.toFixed(Math.max(0, Math.min(maxDecimalPlaces, maxSignificantFigures - Math.floor(1 + Math.log10(num))))) + symbols[i];
}
/** Convert a shortened number back into a value */
export function parseShortNumber(text = "0") {
    let parsed = Number(text);
    if (!isNaN(parsed)) return parsed;
    for (const sym of symbols.slice(1))
        if (text.toLowerCase().endsWith(sym))
            return Number.parseFloat(text.slice(0, text.length - sym.length)) * Math.pow(10, 3 * symbols.indexOf(sym));
    return Number.NaN;
}
/** Helper to get a list of all hostnames on the network
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
export function scanAllServers(ns) {
    checkNsInstance(ns, '"scanAllServers"');
    let discoveredHosts = []; // Hosts (a.k.a. servers) we have scanned
    let hostsToScan = ["home"]; // Hosts we know about, but have no yet scanned
    let infiniteLoopProtection = 9999; // In case you mess with this code, this should save you from getting stuck
    while (hostsToScan.length > 0 && infiniteLoopProtection-- > 0) { // Loop until the list of hosts to scan is empty
        let hostName = hostsToScan.pop(); // Get the next host to be scanned
        for (const connectedHost of ns.scan(hostName)) // "scan" (list all hosts connected to this one)
            if (!discoveredHosts.includes(connectedHost)) // If we haven't already scanned this host
                hostsToScan.push(connectedHost); // Add it to the queue of hosts to be scanned
        discoveredHosts.push(hostName); // Mark this host as "scanned"
    }
    return discoveredHosts; // The list of scanned hosts should now be the set of all hosts in the game!
}

/** @param {NS} ns 
 * Returns a helpful error message if we forgot to pass the ns instance to a function */
export function checkNsInstance(ns, fnName = "this function") {
    if (!ns.print) throw new Error(`The first argument to ${fnName} should be a 'ns' instance.`);
    return ns;
}
/** Joins all arguments as components in a path, e.g. pathJoin("foo", "bar", "/baz") = "foo/bar/baz" **/
export function pathJoin(...args) {
    return args.filter(s => !!s).join('/').replace(/\/\/+/g, '/');
}
/** Gets the path for the given local file, taking into account optional subfolder relocation via git-pull.js **/
export function getFilePath(file) {
    const subfolder = '/smircher/';  // git-pull.js optionally modifies this when downloading
    return pathJoin(subfolder, file);
}

/** Helper to launch a script and log whether if it succeeded or failed
 * @param {NS} ns 
 * @param {String} baseScriptName
 * @param {Array} args
 * @param {Boolean} convertFileName
 * Returns pid of running process */
export function launchScriptHelper(ns, baseScriptName, args = [], convertFileName = true) {
	// ns.tail(); // If we're going to be launching scripts, show our tail window so that we can easily be killed if the user wants to interrupt.
	const pid = ns.run(convertFileName ? getFilePath(baseScriptName) : baseScriptName, 1, ...args);
	if (!pid)
		log(ns, `ERROR: Failed to launch ${baseScriptName} with args: [${args.join(", ")}]`, true, 'error');
	else
		log(ns, `INFO: Launched ${baseScriptName} (pid: ${pid}) with args: [${args.join(", ")}]`, false);
	return pid;
}
/** If the argument is an Error instance, returns it as is, otherwise, returns a new Error instance. */
function asError(error) {
    return error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
}
/** Helper to retry something that failed temporarily (can happen when e.g. we temporarily don't have enough RAM to run)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
 export async function autoRetry(ns, fnFunctionThatMayFail, fnSuccessCondition, errorContext = "Success condition not met",
 maxRetries = 5, initialRetryDelayMs = 50, backoffRate = 3, verbose = false, tprintFatalErrors = true) {
 checkNsInstance(ns, '"autoRetry"');
 let retryDelayMs = initialRetryDelayMs, attempts = 0;
 while (attempts++ <= maxRetries) {
     try {
         const result = await fnFunctionThatMayFail()
         const error = typeof errorContext === 'string' ? errorContext : errorContext();
         if (!fnSuccessCondition(result))
             throw asError(error);
         return result;
     }
     catch (error) {
         const fatal = attempts >= maxRetries;
         log(ns, `${fatal ? 'FAIL' : 'INFO'}: Attempt ${attempts} of ${maxRetries} failed` +
             (fatal ? `: ${typeof error === 'string' ? error : error.message || JSON.stringify(error)}` : `. Trying again in ${retryDelayMs}ms...`),
             tprintFatalErrors && fatal, !verbose ? undefined : (fatal ? 'error' : 'info'))
         if (fatal) throw asError(error);
         await ns.sleep(retryDelayMs);
         retryDelayMs *= backoffRate;
     }
 }
}

/** Helper to log a message, and optionally also tprint it and toast it
 * @param {NS} ns - The nestcript instance passed to your script's main entry point */
 export function log(ns, message = "", alsoPrintToTerminal = false, toastStyle = "", maxToastLength = Number.MAX_SAFE_INTEGER) {
    ns.print(message);
    if (toastStyle) ns.toast(message.length <= maxToastLength ? message : message.substring(0, maxToastLength - 3) + "...", toastStyle);
    if (alsoPrintToTerminal) {
        ns.tprint(message);
        // TODO: Find a way write things logged to the terminal to a "permanent" terminal log file, preferably without this becoming an async function.
        //       Perhaps we copy logs to a port so that a separate script can optionally pop and append them to a file.
        //ns.write("log.terminal.txt", message + '\n', 'a'); // Note: we should get away with not awaiting this promise since it's not a script file
    }
    return message;
}
/** @param {NS} ns **/
export function disableLogs(ns, listOfLogs) { ['disableLog'].concat(...listOfLogs).forEach(log => checkNsInstance(ns, '"disableLogs"').disableLog(log)); }

/**
 * Retrieve the result of an ns command by executing it in a temporary .js script, writing the result to a file, then shuting it down
 * Importing incurs a maximum of 1.1 GB RAM (0 GB for ns.read, 1 GB for ns.run, 0.1 GB for ns.isRunning).
 * Has the capacity to retry if there is a failure (e.g. due to lack of RAM available). Not recommended for performance-critical code.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 * @param {bool=} verbose - (default false) If set to true, pid and result of command are logged.
 **/
 export async function getNsDataThroughFile(ns, command, fName, args = [], verbose = false, maxRetries = 5, retryDelayMs = 50) {
    checkNsInstance(ns, '"getNsDataThroughFile"');
    if (!verbose) disableLogs(ns, ['run', 'isRunning']);
    return await getNsDataThroughFile_Custom(ns, ns.run, ns.isRunning, command, fName, args, verbose, maxRetries, retryDelayMs);
}

/**
 * An advanced version of getNsDataThroughFile that lets you pass your own "fnRun" and "fnIsAlive" implementations to reduce RAM requirements
 * Importing incurs no RAM (now that ns.read is free) plus whatever fnRun / fnIsAlive you provide it
 * Has the capacity to retry if there is a failure (e.g. due to lack of RAM available). Not recommended for performance-critical code.
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {function} fnRun - A single-argument function used to start the new sript, e.g. `ns.run` or `(f,...args) => ns.exec(f, "home", ...args)`
 * @param {function} fnIsAlive - A single-argument function used to start the new sript, e.g. `ns.isRunning` or `pid => ns.ps("home").some(process => process.pid === pid)`
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 **/
 export async function getNsDataThroughFile_Custom(ns, fnRun, fnIsAlive, command, fName, args = [], verbose = false, maxRetries = 5, retryDelayMs = 50) {
    checkNsInstance(ns, '"getNsDataThroughFile_Custom"');
    if (!verbose) disableLogs(ns, ['read']);
    const commandHash = hashCode(command);
    fName = fName || `/Temp/${commandHash}-data.txt`;
    const fNameCommand = (fName || `/Temp/${commandHash}-command`) + '.js'
    // Pre-write contents to the file that will allow us to detect if our temp script never got run
    const initialContents = "<Insufficient RAM>";
    await ns.write(fName, initialContents, 'w');
    // Prepare a command that will write out a new file containing the results of the command
    // unless it already exists with the same contents (saves time/ram to check first)
    // If an error occurs, it will write an empty file to avoid old results being misread.
    const commandToFile = `let r;try{r=JSON.stringify(\n` +
        `    ${command}\n` +
        `);}catch(e){r="ERROR: "+(typeof e=='string'?e:e.message||JSON.stringify(e));}\n` +
        `const f="${fName}"; if(ns.read(f)!==r) await ns.write(f,r,'w')`;
    // Run the command with auto-retries if it fails
    const pid = await runCommand_Custom(ns, fnRun, commandToFile, fNameCommand, args, verbose, maxRetries, retryDelayMs);
    // Wait for the process to complete (TODO: Replace the need for a `fnIsAlive` with one that simply checks the file contents are no longer `initialContents`)
    await waitForProcessToComplete_Custom(ns, fnIsAlive, pid, verbose);
    if (verbose) ns.print(`Process ${pid} is done. Reading the contents of ${fName}...`);
    // Read the file, with auto-retries if it fails // TODO: Unsure reading a file can fail or needs retrying. 
    let lastRead;
    const fileData = await autoRetry(ns, () => ns.read(fName),
        f => (lastRead = f) !== undefined && f !== "" && f !== initialContents && !(typeof f == "string" && f.startsWith("ERROR: ")),
        () => `\nns.read('${fName}') returned a bad result: "${lastRead}".` +
            `\n  Script:  ${fNameCommand}\n  Args:    ${JSON.stringify(args)}\n  Command: ${command}` +
            (lastRead == undefined ? '\nThe developer has no idea how this could have happened. Please post a screenshot of this error on discord.' :
                lastRead == initialContents ? `\nThe script that ran this will likely recover and try again later once you have more free ram.` :
                    lastRead == "" ? `\nThe file appears to have been deleted before a result could be retrieved. Perhaps there is a conflicting script.` :
                        `\nThe script was likely passed invalid arguments. Please post a screenshot of this error on discord.`),
        maxRetries, retryDelayMs, undefined, verbose, verbose);
    if (verbose) ns.print(`Read the following data for command ${command}:\n${fileData}`);
    return JSON.parse(fileData); // Deserialize it back into an object/array and return
}
/**
 * An advanced version of waitForProcessToComplete that lets you pass your own "isAlive" test to reduce RAM requirements (e.g. to avoid referencing ns.isRunning)
 * Importing incurs 0 GB RAM (assuming fnIsAlive is implemented using another ns function you already reference elsewhere like ns.ps) 
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {function} fnIsAlive - A single-argument function used to start the new sript, e.g. `ns.isRunning` or `pid => ns.ps("home").some(process => process.pid === pid)`
 **/
 export async function waitForProcessToComplete_Custom(ns, fnIsAlive, pid, verbose) {
    checkNsInstance(ns, '"waitForProcessToComplete_Custom"');
    if (!verbose) disableLogs(ns, ['sleep']);
    // Wait for the PID to stop running (cheaper than e.g. deleting (rm) a possibly pre-existing file and waiting for it to be recreated)
    let start = Date.now();
    let sleepMs = 1;
    for (var retries = 0; retries < 1000; retries++) {
        if (!fnIsAlive(pid)) break; // Script is done running
        if (verbose && retries % 100 === 0) ns.print(`Waiting for pid ${pid} to complete... (${formatDuration(Date.now() - start)})`);
        await ns.sleep(sleepMs);
        sleepMs = Math.min(sleepMs * 2, 200);
    }
    // Make sure that the process has shut down and we haven't just stopped retrying
    if (fnIsAlive(pid)) {
        let errorMessage = `run-command pid ${pid} is running much longer than expected. Max retries exceeded.`;
        ns.print(errorMessage);
        throw new Error(errorMessage);
    }
}
/** Workaround a current bitburner bug by yeilding briefly to the game after executing something.
 * @param {NS} ns
 * @param {String} script - Filename of script to execute.
 * @param {int} host - Hostname of the target server on which to execute the script.
 * @param {int} numThreads - Optional thread count for new script. Set to 1 by default. Will be rounded to nearest integer.
 * @param args - Additional arguments to pass into the new script that is being run. Note that if any arguments are being passed into the new script, then the third argument numThreads must be filled in with a value.
 * @returns — Returns the PID of a successfully started script, and 0 otherwise.
 * Workaround a current bitburner bug by yeilding briefly to the game after executing something. **/
 export async function exec(ns, script, host, numThreads, ...args) {
    // Try to run the script with auto-retry if it fails to start
    // It doesn't make sense to auto-retry hack tools, only add error handling to other scripts
    // Otherwise, run with auto-retry to handle e.g. temporary ram issues
    let verbose = false;
    const pid = await autoRetry(ns, async () => {
        const p = ns.exec(script, host, numThreads, ...args)
        return p;
    }, p => p !== 0, () => new Error(`Failed to exec ${script} on ${host} with ${numThreads} threads. ` +
        `This is likely due to having insufficient RAM. Args were: [${args}]`),
        undefined, undefined, undefined, verbose, verbose);
    return pid; // Caller is responsible for handling errors if final pid returned is 0 (indicating failure)
}

/** A helper to parse the command line arguments with a bunch of extra features, such as
 * - Loading a persistent defaults override from a local config file named after the script.
 * - Rendering "--help" output without all scripts having to explicitly specify it
 * @param {NS} ns
 * @param {[string, string | number | boolean | string[]][]} argsSchema - Specification of possible command line args. **/
 export function getConfiguration(ns, argsSchema) {
    checkNsInstance(ns, '"getConfig"');
    const scriptName = ns.getScriptName();
    // If the user has a local config file, override the defaults in the argsSchema
    const confName = `${scriptName}.config.txt`;
    const overrides = ns.read(confName);
    const overriddenSchema = overrides ? [...argsSchema] : argsSchema; // Clone the original args schema    
    if (overrides) {
        try {
            let parsedOverrides = JSON.parse(overrides); // Expect a parsable dict or array of 2-element arrays like args schema
            if (Array.isArray(parsedOverrides)) parsedOverrides = Object.fromEntries(parsedOverrides);
            log(ns, `INFO: Applying ${Object.keys(parsedOverrides).length} overriding default arguments from "${confName}"...`);
            for (const key in parsedOverrides) {
                const override = parsedOverrides[key];
                const matchIndex = overriddenSchema.findIndex(o => o[0] == key);
                const match = matchIndex === -1 ? null : overriddenSchema[matchIndex];
                if (!match)
                    throw new Error(`Unrecognized key "${key}" does not match of this script's options: ` + JSON.stringify(argsSchema.map(a => a[0])));
                else if (override === undefined)
                    throw new Error(`The key "${key}" appeared in the config with no value. Some value must be provided. Try null?`);
                else if (match && JSON.stringify(match[1]) != JSON.stringify(override)) {
                    if (typeof (match[1]) !== typeof (override))
                        log(ns, `WARNING: The "${confName}" overriding "${key}" value: ${JSON.stringify(override)} has a different type (${typeof override}) than the ` +
                            `current default value ${JSON.stringify(match[1])} (${typeof match[1]}). The resulting behaviour may be unpredictable.`, false, 'warning');
                    else
                        log(ns, `INFO: Overriding "${key}" value: ${JSON.stringify(match[1])}  ->  ${JSON.stringify(override)}`);
                    overriddenSchema[matchIndex] = { ...match }; // Clone the (previously shallow-copied) object at this position of the new argsSchema
                    overriddenSchema[matchIndex][1] = override; // Update the value of the clone.
                }
            }
        } catch (err) {
            log(ns, `ERROR: There's something wrong with your config file "${confName}", it cannot be loaded.` +
                `\nThe error encountered was: ${(typeof err === 'string' ? err : err.message || JSON.stringify(err))}` +
                `\nYour config file should either be a dictionary e.g.: { "string-opt": "value", "num-opt": 123, "array-opt": ["one", "two"] }` +
                `\nor an array of dict entries (2-element arrays) e.g.: [ ["string-opt", "value"], ["num-opt", 123], ["array-opt", ["one", "two"]] ]` +
                `\n"${confName}" contains:\n${overrides}`, true, 'error', 80);
            return null;
        }
    }
    // Return the result of using the in-game args parser to combine the defaults with the command line args provided
    try {
        const finalOptions = ns.flags(overriddenSchema);
        log(ns, `INFO: Running ${scriptName} with the following settings:` + Object.keys(finalOptions).filter(a => a != "_").map(a =>
            `\n  ${a.length == 1 ? "-" : "--"}${a} = ${finalOptions[a] === null ? "null" : JSON.stringify(finalOptions[a])}`).join("") +
            `\nrun ${scriptName} --help  to get more information about these options.`)
        return finalOptions;
    } catch (err) { // Detect if the user passed invalid arguments, and return help text
        const error = ns.args.includes("help") || ns.args.includes("--help") ? null : // Detect if the user explictly asked for help and suppress the error
            (typeof err === 'string' ? err : err.message || JSON.stringify(err));
        // Try to parse documentation about each argument from the source code's comments
        const source = ns.read(scriptName).split("\n");
        let argsRow = 1 + source.findIndex(row => row.includes("argsSchema ="));
        const optionDescriptions = {}
        while (argsRow && argsRow < source.length) {
            const nextArgRow = source[argsRow++].trim();
            if (nextArgRow.length == 0) continue;
            if (nextArgRow[0] == "]" || nextArgRow.includes(";")) break; // We've reached the end of the args schema
            const commentSplit = nextArgRow.split("//").map(e => e.trim());
            if (commentSplit.length != 2) continue; // This row doesn't appear to be in the format: [option...], // Comment
            const optionSplit = commentSplit[0].split("'"); // Expect something like: ['name', someDefault]. All we need is the name
            if (optionSplit.length < 2) continue;
            optionDescriptions[optionSplit[1]] = commentSplit[1];
        }
        log(ns, (error ? `ERROR: There was an error parsing the script arguments provided: ${error}\n` : 'INFO: ') +
            `${scriptName} possible arguments:` + argsSchema.map(a => `\n  ${a[0].length == 1 ? " -" : "--"}${a[0].padEnd(30)} ` +
                `Default: ${(a[1] === null ? "null" : JSON.stringify(a[1])).padEnd(10)}` +
                (a[0] in optionDescriptions ? ` // ${optionDescriptions[a[0]]}` : '')).join("") + '\n' +
            `\nTip: All argument names, and some values support auto-complete. Hit the <tab> key to autocomplete or see possible options.` +
            `\nTip: Array arguments are populated by specifying the argument multiple times, e.g.:` +
            `\n       run ${scriptName} --arrayArg first --arrayArg second --arrayArg third  to run the script with arrayArg=[first, second, third]` +
            (!overrides ? `\nTip: You can override the default values by creating a config file named "${confName}" containing e.g.: { "arg-name": "preferredValue" }`
                : overrides && !error ? `\nNote: The default values are being modified by overrides in your local "${confName}":\n${overrides}`
                    : `\nThis error may have been caused by your local overriding "${confName}" (especially if you changed the types of any options):\n${overrides}`), true);
        return null; // Caller should handle null and shut down elegantly.
    }
}
/** @param {NS} ns 
 * Returns the number of instances of the current script running on the specified host. **/
 export async function instanceCount(ns, onHost = "home", warn = true, tailOtherInstances = true) {
    checkNsInstance(ns, '"alreadyRunning"');
    const scriptName = ns.getScriptName();
    const others = await getNsDataThroughFile(ns, 'ns.ps(ns.args[0]).filter(p => p.filename == ns.args[1]).map(p => p.pid)',
        '/Temp/ps-other-instances.txt', [onHost, scriptName]);
    if (others.length >= 2) {
        if (warn)
            log(ns, `WARNING: You cannot start multiple versions of this script (${scriptName}). Please shut down the other instance first.` +
                (tailOtherInstances ? ' (To help with this, a tail window for the other instance will be opened)' : ''), true, 'warning');
        if (tailOtherInstances) // Tail all but the last pid, since it will belong to the current instance (which will be shut down)
            others.slice(0, others.length - 1).forEach(pid => ns.tail(pid));
    }
    return others.length;
}

/** Generate a hashCode for a string that is pretty unique most of the time */
export function hashCode(s) { return s.split("").reduce(function (a, b) { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0); }

/**
 * An advanced version of runCommand that lets you pass your own "isAlive" test to reduce RAM requirements (e.g. to avoid referencing ns.isRunning)
 * Importing incurs 0 GB RAM (assuming fnRun, fnWrite are implemented using another ns function you already reference elsewhere like ns.exec)
 * @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @param {function} fnRun - A single-argument function used to start the new sript, e.g. `ns.run` or `(f,...args) => ns.exec(f, "home", ...args)`
 * @param {string} command - The ns command that should be invoked to get the desired data (e.g. "ns.getServer('home')" )
 * @param {string=} fileName - (default "/Temp/{commandhash}-data.txt") The name of the file to which data will be written to disk by a temporary process
 * @param {args=} args - args to be passed in as arguments to command being run as a new script.
 **/
 export async function runCommand_Custom(ns, fnRun, command, fileName, args = [], verbose = false, maxRetries = 5, retryDelayMs = 50) {
    checkNsInstance(ns, '"runCommand_Custom"');
    if (!Array.isArray(args)) throw new Error(`args specified were a ${typeof args}, but an array is required.`);
    if (verbose) // In verbose mode, wrap the command in something that will dump it's output to the terminal
        command = `try { let output = ${command}; ns.tprint(JSON.stringify(output)); } ` +
            `catch(e) { ns.tprint('ERROR: '+(typeof e=='string'?e:e.message||JSON.stringify(e))); throw(e); }`;
    else disableLogs(ns, ['sleep']);
    // Auto-import any helpers that the temp script attempts to use
    const required = getExports(ns).filter(e => command.includes(`${e}(`));
    let script = (required.length > 0 ? `import { ${required.join(", ")} } from 'helpers.js'\n` : '') +
        `export async function main(ns) { ${command} }`;
    fileName = fileName || `/Temp/${hashCode(command)}-command.js`;
    // It's possible for the file to be deleted while we're trying to execute it, so even wrap writing the file in a retry
    return await autoRetry(ns, async () => {
        // To improve performance, don't re-write the temp script if it's already in place with the correct contents.
        const oldContents = ns.read(fileName);
        if (oldContents != script) {
            if (oldContents) // Create some noise if temp scripts are being created with the same name but different contents
                ns.tprint(`WARNING: Had to overwrite temp script ${fileName}\nOld Contents:\n${oldContents}\nNew Contents:\n${script}` +
                    `\nThis warning is generated as part of an effort to switch over to using only 'immutable' temp scripts. ` +
                    `Please paste a screenshot in Discord at https://discord.com/channels/415207508303544321/935667531111342200`);
            await ns.write(fileName, script, "w");
            // Wait for the script to appear and be readable (game can be finicky on actually completing the write)
            await autoRetry(ns, () => ns.read(fileName), c => c == script, () => `Temporary script ${fileName} is not available, ` +
                `despite having written it. (Did a competing process delete or overwrite it?)`, maxRetries, retryDelayMs, undefined, verbose, verbose);
        }
        // Run the script, now that we're sure it is in place
        return fnRun(fileName, 1 /* Always 1 thread */, ...args);
    }, pid => pid !== 0,
        () => `The temp script was not run (likely due to insufficient RAM).` +
            `\n  Script:  ${fileName}\n  Args:    ${JSON.stringify(args)}\n  Command: ${command}` +
            `\nThe script that ran this will likely recover and try again later once you have more free ram.`,
        maxRetries, retryDelayMs, undefined, verbose, verbose);
}

const _cachedExports = [];
/** @param {NS} ns - The nestcript instance passed to your script's main entry point
 * @returns {string[]} The set of all funciton names exported by this file. */
function getExports(ns) {
    if (_cachedExports.length > 0) return _cachedExports;
    const scriptHelpersRows = ns.read(getFilePath('helpers.js')).split("\n");
    for (const row of scriptHelpersRows) {
        if (!row.startsWith("export")) continue;
        const funcNameStart = row.indexOf("function") + "function".length + 1;
        const funcNameEnd = row.indexOf("(", funcNameStart);
        _cachedExports.push(row.substring(funcNameStart, funcNameEnd));
    }
    return _cachedExports;
}

// Some DOM helpers (partial credit to @ShamesBond)

export async function click(ns,elem) {
	await elem[Object.keys(elem)[1]].onClick({ isTrusted: true });
	await ns.sleep(1000);
}
export async function setText(ns,input, text) {
	await input[Object.keys(input)[1]].onChange({ isTrusted: true, target: { value: text } });
	await ns.sleep(1000);
}
export function find(xpath) {
    const doc = document;
	let item =  doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
	return item.singleNodeValue; 
}
export async function findRetry(ns, xpath, expectFailure = false, retries = null) {
	try {
		return await autoRetry(ns, () => find(xpath), e => e !== undefined,
			() => expectFailure ? `It's looking like the element with xpath: ${xpath} isn't present...` :
				`Could not find the element with xpath: ${xpath}\nSomething may have re-routed the UI`,
			retries != null ? retries : expectFailure ? 3 : 10, 1, 2);
	} catch (e) {
		if (!expectFailure) throw e;
	}
}