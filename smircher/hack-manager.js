/** @param {NS} ns */
export async function main(ns) {
	let args = ns.args;
	// Defines the "target server", which is the server
	// that we're going to hack. In this case, it's "joesguns"
	let targets = args[0] ? args[0]:"joesguns";
	let threshold = args[1] ? args[1]:0.75;
	let getMoney = args[2] != undefined ? args[2]:true;
	let growMem = args[3] !== undefined ? args[3]:1.75;
	let hackMem = args[4] !== undefined ? args[4]:1.7;
	let weakenMem = args[5] !== undefined ? args[5]:1.6;
	// Defines how much money a server should have before we hack it
	// In this case, it is set to 75% of the server's max money
	
	let name = ns.getHostname();
	// Defines the maximum security level the target server can
	// have. If the target's security level is higher than this,
	// we'll weaken it before doing anything else
	
	function getRandomInt(max) {
		return Math.floor(Math.random() * max);
	}
	
	let mem = ns.getServerRam(name);
	let growThreads = Math.floor((mem[0]-mem[1])*threshold/growMem);
	let hackThreads = Math.floor((mem[0]-mem[1])*threshold/hackMem);
	let weakenThreads = Math.floor((mem[0]-mem[1])*threshold/weakenMem);
	// Infinite loop that continously hacks/grows/weakens the target server
	if ( growThreads == 0 || hackThreads == 0 || weakenThreads == 0 ) {
		ns.tprint(`Cannot run on ${name} due to low RAM`);
		return;
	}
	await killemall(ns,name);
	// simple round robin.  Works if the number of threads is small.
	try {
		//args[0: target, 1: desired start time, 2: expected end, 3: expected duration, 4: description, 5: disable toast warnings, 6: loop]
		if( targets.indexOf(',') > -1 ) {
			targets = targets.split(',');
		}
		if( ! Array.isArray( targets ) ) {
			targets =  [ targets ];
		}
		let mem = ns.getServerRam(name);
		let growThreads = Math.floor((mem[0]-mem[1])*threshold/growMem);
		let hackThreads = Math.floor((mem[0]-mem[1])*threshold/hackMem);
		let weakenThreads = Math.floor((mem[0]-mem[1])*threshold/weakenMem);
		let totalMoney=0;
		for( let i = 0; i < targets.length; i++) {
			totalMoney += ns.getServerMaxMoney(targets[i]);
		}
		
		ns.print(`Starting loop on ${name} RAMMax: ${mem[0]} RAM-Used:${mem[1]} GrowThreads ${growThreads} HackThreads ${hackThreads} weakThreads ${weakenThreads} GetMoney ${getMoney}`);
		while(true) {
			for( let i = 0; i < targets.length; i++ ) {
				let target = targets[ i ] ;
				let moneyThresh = ns.getServerMaxMoney(target) * threshold;
				let securityThresh = ns.getServerMinSecurityLevel(target) + 5;
				let sargs = [ target ];
				// growThreads = Math.floor(growThreads/targets.length);
				// hackThreads = Math.floor(hackThreads/targets.length);
				// weakenThreads = Math.floor(weakenThreads/targets.length);
				let perc = ( moneyThresh / totalMoney );
				let gThreads = Math.floor( growThreads * perc );
				let hThreads = Math.floor( hackThreads * perc );
				let wThreads = Math.floor( weakenThreads * perc );
				gThreads < 1 ? 1:gThreads;
				hThreads < 1 ? 1:hThreads;
				wThreads < 1 ? 1:wThreads;
				if (ns.getServerSecurityLevel(target) > securityThresh && wThreads > 0 ) {
					// If the server's security level is above our threshold, weaken it
					if( ! ns.isRunning('/smircher/Remote/weak-target.js',name, ...sargs) ) {
						ns.run('/smircher/Remote/weak-target.js', wThreads, ...sargs);
					}					
				} else if ((ns.getServerMoneyAvailable(target) < moneyThresh || ! getMoney) && gThreads > 0 ) {
					// If the server's money is less than our threshold, grow it
					if( ! ns.isRunning('/smircher/Remote/grow-target.js',name, ...sargs) ) {
						ns.run('/smircher/Remote/grow-target.js', gThreads, ...sargs);
					}
				} else if( getMoney && hThreads > 0) {
					// Otherwise, hack it
					if( ! ns.isRunning('/smircher/Remote/hack-target.js',name, ...sargs) ) {
						// if( hThreads < 50 ) {
							ns.run('/smircher/Remote/hack-target.js', hThreads, ...sargs);
						// } else {
						// 	let div = Math.floor(hThreads / 50);
						// 	let rem = hThreads - ( div * 50 );
						// 	for( let r = 0; r < div ; r++ ) {
						// 		ns.run('/smircher/Remote/hack-target.js', 50, ...sargs);
						// 	}
						// 	ns.run('/smircher/Remote/hack-target.js', rem, ...sargs);
						// }						
					}
				}
			}
			await ns.sleep(1000);
		}
	} catch(e) {
		ns.tprint(`Could not run loop on ${name} RAMMax: ${mem[0]} RAM-Used:${mem[1]} GrowThreads ${growThreads} HackThreads ${hackThreads} weakThreads ${weakenThreads} GetMoney ${getMoney}`);
		ns.tprint(JSON.stringify(e,null,4))
	}
	
}
async function killemall(ns, name, skip=null) {
	let scripts = ['/smircher/Remote/weak-target.js','/smircher/Remote/grow-target.js','/smircher/Remote/hack-target.js'];
	ns.disableLog('kill')
	try {
		for( let script in scripts ){
			if( skip == null || scripts[script] != skip ) {
				await ns.kill( scripts[script], name );
			}
		}		
	} catch {}
	ns.enableLog('kill');
	await ns.sleep(100);
}