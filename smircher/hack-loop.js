import {
    formatMoney, launchScriptHelper, formatNumberShort, exec, log, getConfiguration, disableLogs, instanceCount
} from '/smircher/utils.js'

const argsSchema = [
    ['threshold', 0.9], // Threshold of system resources to use
    ['loop', true], // Run as Daemon
    ['reload',false], // Should we copy scripts back to the targets if they are missing.
    ['prioritize_xp', false], // Prioritize hack xp over money    
    ['tail', false] // open tail window on run
];

export function autocomplete(data, _) {
    data.flags(argsSchema);
    return [];
}
/** @param {NS} ns */
export async function main(ns) {
	let args = ns.args;
    const runOptions = getConfiguration(ns, argsSchema);
    if (!runOptions || await instanceCount(ns) > 1) return; // Prevent multiple instances of this script from being started, even with different args.
    let options = runOptions; // We don't set the global "options" until we're sure this is the only running instance
    let loop = options.loop;
    disableLogs(ns, ['sleep', 'run', 'getServerMaxRam', 'getServerUsedRam']);
	// let servers = scanAllServers(ns);
	let threshold = options.threshold;
    let reload = options.reload;
    let prioritize_xp = options.prioritize_xp;
	let servers = ["home"];
    let sd = [["home"]];
    let serverDetails = {};
    let depth = 10;
    let player = ns.getPlayer();
    let skipHost = ['darkweb'];

    let serverInfo = (x, useCache = true) => {
        if ( ! serverDetails[x]  || ! useCache )
            serverDetails[x] = ns.getServer(x); // If we do not have it cached, then fetch it
        return serverDetails[x]; 
    }

	let ordering = (a, b) => {
        let d = serverInfo(b).purchasedByPlayer - serverInfo(a).purchasedByPlayer;// Purchased servers to the very top
        d = d != 0 ? d : ns.scan(b).hasAdminRights - ns.scan(a).hasAdminRights; // Sort servers we admin.    
        d = d != 0 ? d :  serverInfo(b).moneyMax - serverInfo(a).moneyMax // Servers with the highest money go down    
        d = d != 0 ? d : a.slice(0, 2).toLowerCase().localeCompare(b.slice(0, 2).toLowerCase()); // Hack: compare nameust the first 2 chars to keep purchased servers in order purchased
        return d;
    }

	let buildtree = ( server, children = [] ) => {
        let name;
        for (name of ns.scan(server).sort(ordering)) {
            if (!servers.includes(name)) {
                servers.push(name); // Keep us from having the same server in the list multiple times.
                children.push(name);
            }
        }
        return children;
	}
    async function killScripts ( server ) {
        try { await ns.scriptKill('/smircher/hack-manager.js',server); } catch{}
        try { await ns.scriptKill('/smircher/Remote/weak-target.js',server); } catch{}
        try { await ns.scriptKill('/smircher/Remote/grow-target.js',server); } catch{}
        try { await ns.scriptKill('/smircher/Remote/hack-target.js',server); } catch{}
        return;
    }
    function shuffle(array) {
        let currentIndex = array.length,  randomIndex;
      
        // While there remain elements to shuffle.
        while (currentIndex != 0) {
      
          // Pick a remaining element.
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex--;
      
          // And swap it with the current element.
          [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
        }
      
        return array;
      }
    let initialized = 0;
    do {
        /** start from local, query and sort locally connected servers */
        for ( let i = 0; i < depth; i++ ) {
            /** get the array at the current depth, then fetch and order its kids*/
            let s = sd[i];
            let nextDepth = i+1;
            let children = []
            for( let ind in sd[i] ) {
                buildtree(sd[i][ind],children);
            }
            let sorted = children.sort(ordering);
            sd[nextDepth] = sorted;
        }
        for ( let i = 0; i < servers.length; i++ ) {
            let server = servers[i];
            let serverDetail = serverInfo(server);
            if( skipHost.includes(serverDetail.hostname))
                continue;
            /** from there, step through servers, if we have the root, scp files to those servers, and kick off the hack. */
            log(ns,`Server: ${server} Owned: ${serverDetail.purchasedByPlayer.toString()} 
                hasAdminRights: ${serverDetail.hasAdminRights.toString()} 
                MaxCash:${formatMoney(serverDetail.moneyMax)}`)
            if ( ! serverDetail.hasAdminRights && serverDetail.hackDifficulty <= player.skills.hacking ) {
                launchScriptHelper( ns, 'crack-host.js', [ serverDetail.hostname ] );
            }
            if( reload || !ns.fileExists('/smircher/hack-manager.js', serverDetail.hostname ) ) {
                if ( serverDetail.hackDifficulty < player.skills.hacking ) {
                    await killScripts( serverDetail.hostname );
                }
                if( serverDetail.hostname !== "home") {
                    await ns.rm( '/smircher/hack-manager.js',serverDetail.hostname );
                    await ns.rm( '/smircher/Remote/weak-target.js',serverDetail.hostname );
                    await ns.rm( '/smircher/Remote/grow-target.js',serverDetail.hostname );
                    await ns.rm( '/smircher/Remote/hack-target.js',serverDetail.hostname ); 
                    await ns.scp( '/smircher/hack-manager.js',serverDetail.hostname, 'home' );
                    await ns.scp( '/smircher/Remote/weak-target.js',serverDetail.hostname, 'home' );
                    await ns.scp( '/smircher/Remote/grow-target.js',serverDetail.hostname, 'home' );
                    await ns.scp( '/smircher/Remote/hack-target.js',serverDetail.hostname, 'home' );   
                }
            }
        }
        
        await ns.sleep(5000); // waiting for the servers to stop running scripts
        let weakenRam = ns.getScriptRam('/smircher/Remote/weak-target.js','home');
        let growRam = ns.getScriptRam('/smircher/Remote/grow-target.js','home');
        let hackRam = ns.getScriptRam('/smircher/Remote/hack-target.js','home');
        let manageRam = ns.getScriptRam('/smircher/hack-manager.js', 'home');
        // find the correct host to hack, given our current hacking skill
        let target,cash, targets=[];
        for( let i = 0; i < servers.length; i++) {
            let serverDetail = serverInfo(servers[i],false);
            if( serverDetail.hasAdminRights && ( serverDetail.requiredHackingSkill < ( player.skills.hacking / 3 ) ) && ( cash == undefined || serverDetail.moneyMax > cash)) {
                // ns.tprint(`Choosing ${serverDetail.hostname} for money hacking. ${serverDetail.moneyMax} > ${cash == undefined ? 0:cash} ${player.skills.hacking} > ${serverDetail.requiredHackingSkill}`)
                target = serverDetail.hostname;
                cash = serverDetail.moneyMax;
                if ( ! skipHost.includes(serverDetail.hostname) && ! serverDetail.purchasedByPlayer && serverDetail.moneyMax > 0 && ! skipHost.includes( serverDetail.hostname ) )
                    targets.push(serverDetail.hostname);
            }
        }
        let inte = targets.sort( function (a, b) {
            let d = serverInfo(a).moneyMax - serverInfo(b).moneyMax;
            return d;
        });
        targets = inte;
        for ( let i = 0; i < servers.length; i++ ) {
            let server = servers[i];
            let serverDetail = serverInfo(server);
            if( skipHost.includes(serverDetail.hostname))
                continue;
                // Run the script on the host
            if( serverDetail.maxRam < manageRam + hackRam ) {
                log(ns,`Skipping ${serverDetail.hostname} due to low RAM ${serverDetail.maxRam}`)
            } else if(ns.getServer(serverDetail.hostname).hasAdminRights) {
                if ( initialized == 1 ) {
                    await killScripts( serverDetail.hostname );
                }
                log(ns,`Running hack-manager on ${serverDetail.hostname}`);
                let sargs;
                shuffle(targets);
                if( prioritize_xp ) {
                    targets = ['joesguns'];
                    target = 'joesguns';
                    threshold = 0.95;
                }
                if((serverDetail.purchasedByPlayer || target == undefined) && ( player.skills.hacking < 500 || prioritize_xp ) && initialized < 1 ) {
                    if( player.skills.hacking < 10 ) {
                        sargs = ['n00dles', threshold, false, growRam,hackRam,weakenRam];
                    } else {
                        sargs = ['joesguns', threshold, false, growRam,hackRam,weakenRam];
                        initialized = 1;
                    }
                    if( reload || !ns.scriptRunning('/smircher/hack-manager.js', serverDetail.hostname) ) {
                        await exec(ns,'/smircher/hack-manager.js', serverDetail.hostname, 1, ...sargs)
                    }
                } else {
                    if ( serverDetail.purchasedByPlayer ) {
                        // we own these, we are going to divide the targets we are running vs the ones we can run.
                        sargs = [ targets.toString(), threshold, ! prioritize_xp, growRam,hackRam,weakenRam];
                        if( reload || !ns.scriptRunning('/smircher/hack-manager.js', serverDetail.hostname) ) {
                            await exec(ns,'/smircher/hack-manager.js', serverDetail.hostname, 1, ...sargs)
                        }
                    } else if( serverDetail.moneyMax > 0 ) {
                        sargs = [ prioritize_xp ? 'joesguns':serverDetail.hostname, threshold, ! prioritize_xp, growRam,hackRam,weakenRam];
                        if( reload || !ns.scriptRunning('/smircher/hack-manager.js', serverDetail.hostname) ) {
                            await exec(ns,'/smircher/hack-manager.js', serverDetail.hostname, 1, ...sargs)
                        }
                    } else {
                        sargs = [ target, threshold, ! prioritize_xp, growRam,hackRam,weakenRam];
                        if( reload || !ns.scriptRunning('/smircher/hack-manager.js', serverDetail.hostname) ) {
                            await exec(ns,'/smircher/hack-manager.js', serverDetail.hostname, 1, ...sargs)
                        }
                    }
                }   
                await ns.sleep(100);             
            }            
        }
        if ( initialized == 1 ) {
            initialized = 2;
        }
        reload = false;
    } while( loop );
}