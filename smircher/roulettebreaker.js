import { autoRetry, log, getConfiguration, instanceCount, disableLogs } from '/smircher/utils.js'
/** @param {NS} ns */
let _ns;
const ran_flag = "/Temp/ran-casino.txt"
const argsSchema = [
    ['loop', true], // Maximum Number of Hacknodes to purchase
    ['bet-ammount',100000000], // Prioritize home compute purchase over augments
    ['tries', 10], // reserve percentage to save for priority purchase
    ['tail',false] // open tail window on run
];

export function autocomplete(data, _) {
    data.flags(argsSchema);
    return [];
}

/** @param {NS} ns */
export async function main(ns) {
    const runOptions = getConfiguration(ns, argsSchema);
    if (!runOptions || await instanceCount(ns) > 1) return; // Prevent multiple instances of this script from being started, even with different args.
    let options = runOptions; // We don't set the global "options" until we're sure this is the only running instance
    disableLogs(ns, ['sleep', 'run', 'getServerMoneyAvailable']);
    _ns=ns;
	let args = ns.args;
	/** args[0] == loop, defaults to true, args[1] == tries, default 10, args[2] == number of bets, 0 == unlimited, args[3] == bet, default is maximum of current money up to 100 Mill. */
	// Save our original functions
	
	let floor = Math.floor;
	let random = Math.random;
	_ns = ns;

	let loop = options.loop;
	let tries = options.tries;
	let ammount = options['bet-ammount'];
	let tail = options.tail;
	/**
	 * canRunCasino()
	 * Check to see if i can run it.
	 * @returns boolean
	 */
	function canRunCasino() {
		if( ns.fileExists( ran_flag, 'home' ) ) {
			return false;
		}
		return true;
	}
	if( tail ) {
		ns.tail();
		await ns.sleep(1000);
		ns.tprint("Starting Tail")
	}
	if( ! canRunCasino() ) {
		return;
	}
	ns.print(`Loop: ${loop.toString()} Tries: ${tries.toString()} Bet ammount: ${ammount.toString()}`);
	let broken = false;
	let breakMath = function() {
		
		//Override default JS functions
		Math.floor = (number) => { return 35 }; 
		Math.random = () => { return 0 };
		/** use: run this, and then go to roulette and bet on the same choice every time.
		 *  WARNING!!!
		 *  the game will crash if you do anything else!
		 *  save the game and reload to fix.
		 */
		 ns.atExit(fixMath);
		 broken=true;
	}
	// fix math function
	let fixMath = () => {
		Math.floor = floor;
		Math.random = random;
		broken=false;
	}
	

	// Step 1.1 Setup the run
	// Helper function to detect if the "Stop [[faction|company] work|styding|training]" etc... button from the focus screen is up
	const checkForFocusScreen = async () =>
		await findRetry(ns, "//button[contains(text(), 'Stop playing')]", true) ? false : // False positive, casino "stop" button, no problems here
			await findRetry(ns, "//button[contains(text(), 'Stop')]", true); // Otherwise, a button with "Stop" on it is probably from the work screen
	let attempts = 0; 
	const btnSaveGame = await findRetry(ns, "//button[@aria-label = 'save game']");
	while (attempts++ <= tries) {
		if (attempts > 1) 
			await ns.sleep(1000);
		try {
			// Step 2.1: If the player is focused, stop the current action
			const btnStopAction = await checkForFocusScreen();
			if (btnStopAction) { // If we were performing an action unfocused, it will be focused on restart and we must stop that action to navigate.
				log(ns, "It looks like we're on a focus screen. Stopping whatever we're doing...")
				await click(btnStopAction);
			}
			// Step 2.2: Navigate to the City Casino
			try { // Try to do this without SF4, because it's faster and doesn't require a temp script to be cleaned up below
				// Click our way to the city casino
				await click(await findRetry(ns, "//div[(@role = 'button') and (contains(., 'City'))]"));
				await click(await findRetry(ns, "//span[@aria-label = 'Iker Molina Casino']"));
			} catch { // Use SF4 as a fallback, it's more reliable.
				try { await getNsDataThroughFile(ns, 'ns.singularity.goToLocation(ns.args[0])', '/Temp/goToLocation.txt', ["Iker Molina Casino"]); }
				catch { return tailAndLog(ns, "ERROR: Failed to travel to the casino both using UI navigation and using SF4 as a fall-back."); }
			}
			// Step 2.3: Try to start the roulette game
			const roulette = await findRetry(ns, "//button[contains(text(), 'roulette')]");
			if (!roulette) {
				tailAndLog(ns, `ERROR: Could not find the "Play roulette" button. Did something steal focus? Trying again... ` +
					`Please post a full-game screenshot on Discord if you can't get past this point.`)
				continue; // Loop back to start and try again
			}
			await click(roulette);

			// Step 2.4: Get some buttons we will need to play roulette
			let inputWager = await findRetry(ns,'//input[@placeholder="Amount to play"]');
			let btnStartGame = await findRetry(ns, "//button[text() = '35']");
			let rtButton = await findRetry(ns, "//button[text() = 'Return to World']");
			if (!inputWager || !btnStartGame || !rtButton) {
				tailAndLog(ns, `ERROR: Could not find one or more game controls. Did something steal focus? Trying again... ` +
					`Please post a full-game screenshot on Discord if you can't get past this point.`)
				continue; // Loop back to start and try again
			}
			let player = ns.getPlayer();
			try {
				inputWager.focus;
				inputWager.value=ammount;
				await click(inputWager);
				await setText(inputWager, `${ammount}`);
				inputWager.stepUp();
			} catch {
				
			}
			let peakWinning = 10000000000;
			ns.tail();
			ns.disableLog('toast');
			breakMath();
			while ( player.money < peakWinning ) {
				// check for cheater, see if i can keep going.
				await click(btnStartGame);
				player = ns.getPlayer();			
			}
			ns.enableLog('toast');
			fixMath();
			break; // We achieved everthing we wanted, we can exit the while loop.
		} catch (err) {
			ns.tail(); // We're having difficulty, pop open a tail window so the user is aware.
			log(ns, `WARNING: casino.js Caught (and suppressed) an unexpected error while navigating to roulette. Will try again...\n` +
				(typeof err === 'string' ? err : err.message || JSON.stringify(err)), false, 'warning');
		}
	}
	await ns.write(ran_flag, true, "w");
	await click(btnSaveGame);
	return await reload(ns); // Reload if we won
}
let doc = eval("document");
// Some DOM helpers (partial credit to @ShamesBond)
async function click(elem) {
	await elem[Object.keys(elem)[1]].onClick({ isTrusted: true });
	await _ns.sleep(1000);
}
async function setText(input, text) {
	await input[Object.keys(input)[1]].onChange({ isTrusted: true, target: { value: text } });
	await _ns.sleep(1000);
}
function find(xpath) {
	let item =  doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
	return item.singleNodeValue; 
}
async function findRetry(ns, xpath, expectFailure = false, retries = null) {
	try {
		return await autoRetry(ns, () => find(xpath), e => e !== undefined,
			() => expectFailure ? `It's looking like the element with xpath: ${xpath} isn't present...` :
				`Could not find the element with xpath: ${xpath}\nSomething may have re-routed the UI`,
			retries != null ? retries : expectFailure ? 3 : 10, 1, 2);
	} catch (e) {
		if (!expectFailure) throw e;
	}
}
/** Helper to open a tail window and log a message to the console and terminal. Useful when trying to inform the player of a failure.
 * @param {NS} ns **/
 function tailAndLog(ns, message) {
	ns.tail();
	log(ns, message, true);
}

/** Forces the game to reload (without saving). Great for save scumming.
 * WARNING: Doesn't work if the user last ran the game with "Reload and kill all scripts" 
 * @param {NS} ns */
 async function reload(ns) {
	eval("window").onbeforeunload = null; // Disable the unsaved changes warning before reloading
	await ns.sleep(1000); // Yield execution for an instant incase the game needs to finish a save or something
	location.reload(); // Force refresh the page without saving           
	await ns.sleep(10000); // Keep the script alive to be safe. Presumably the page reloads before this completes.
}