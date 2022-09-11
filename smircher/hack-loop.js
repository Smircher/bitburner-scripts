import {
    launchScriptHelper, exec, log, getConfiguration, disableLogs, 
    instanceCount, scanAllServers, scriptRamRequired, shuffleArray, cancelHackServer, syncFiles, canHackServer, 
    getServerDetail, 
} from '/smircher/utils.js'

const argsSchema = [
    ['threshold', 0.85], // Threshold of system resources to use
    ['loop', true], // Run as Daemon
    ['reload',false], // Should we copy scripts back to the targets if they are missing.
    ['prioritize_xp', false], // Prioritize hack xp over money   
    ['hack_cap',500], // At what point do we switch to money? 
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
    let player = ns.getPlayer();
    let skipHost = ['darkweb'];
    let hack_cap = options.hack_cap;

	let ordering = (a, b) => {
        let d = getServerDetail(ns,b).purchasedByPlayer - getServerDetail(ns,a).purchasedByPlayer;// Purchased servers to the very top
        d = d != 0 ? d : ns.scan(b).hasAdminRights - ns.scan(a).hasAdminRights; // Sort servers we admin.    
        d = d != 0 ? d :  getServerDetail(ns,b).moneyMax - getServerDetail(ns,a).moneyMax // Servers with the highest money go down    
        d = d != 0 ? d : a.slice(0, 2).toLowerCase().localeCompare(b.slice(0, 2).toLowerCase()); // Hack: compare nameust the first 2 chars to keep purchased servers in order purchased
        return d;
    }
    
    let initialized = 0;
    do {
        servers = await scanAllServers(ns);
        servers.sort(ordering);
        for( let i = 0; i < skipHost.length; i++ ) { // remove skiphost from the list of things to process, like darkweb
            if(servers.indexOf(skipHost[i]) != -1) {
                servers.splice(servers.indexOf(skipHost[i]),1);
            }
        }
        for ( let i = 0; i < servers.length; i++ ) {
            let server = servers[i];
            let serverDetail = getServerDetail(ns,server);
            /** from there, step through servers, if we have the root, scp files to those servers, and kick off the hack. */
            if ( ! serverDetail.hasAdminRights && canHackServer( ns, serverDetail.hostname ) ) {
                launchScriptHelper( ns, 'crack-host.js', [ serverDetail.hostname ] );
            }
            if( reload || !ns.fileExists('/smircher/hack-manager.js', serverDetail.hostname ) ) {
                if ( serverDetail.requiredHackingSkill < player.skills.hacking ) {
                    await cancelHackServer( ns, null,serverDetail.hostname );
                    await syncFiles( ns, serverDetail.hostname );
                }                
            }
        }      
        let ram = scriptRamRequired( ns );
        let manageRam = ram.manageRam;
        let hackRam = ram.hackRam;
        let growRam = ram.growRam;
        let weakenRam = ram.weakenRam;

        await ns.sleep(5000); // waiting for the servers to stop running scripts
        
        // find the correct host to hack, given our current hacking skill
        let target,cash, targets=[];
        for( let i = 0; i < servers.length; i++) {
            let serverDetail = getServerDetail(ns,servers[i],false);
            if( serverDetail.hasAdminRights && ! serverDetail.purchasedByPlayer && ( cash == undefined || serverDetail.moneyMax > cash ) ) {
                // ns.tprint(`Choosing ${serverDetail.hostname} for money hacking. ${serverDetail.moneyMax} > ${cash == undefined ? 0:cash} ${player.skills.hacking} > ${serverDetail.requiredHackingSkill}`)
                target = serverDetail.hostname;
                cash = serverDetail.moneyMax;
            }
            if ( serverDetail.hasAdminRights && ! serverDetail.purchasedByPlayer && serverDetail.moneyMax > 0 )
                    targets.push(serverDetail.hostname);
        }
        let inte = targets.sort( function (a, b) {
            let d = getServerDetail(ns,a).moneyMax - getServerDetail(ns,b).moneyMax;
            return d;
        });
        targets = inte;
        for ( let i = 0; i < servers.length; i++ ) {
            let server = servers[i];
            let serverDetail = getServerDetail(ns,server);
                // Run the script on the host
            if( serverDetail.maxRam < manageRam + hackRam ) {
                log(ns,`Skipping ${serverDetail.hostname} due to low RAM ${serverDetail.maxRam}`)
            } else if(getServerDetail(ns,serverDetail.hostname).hasAdminRights) {
                if ( initialized == 1 ) {
                    await cancelHackServer( ns, null, serverDetail.hostname );
                }
                let sargs;
                
                if( prioritize_xp ) {
                    targets = ['joesguns'];
                    target = 'joesguns';
                    threshold = 0.95;
                } else {
                    shuffleArray(ns,targets);
                }
                if((serverDetail.purchasedByPlayer || target == undefined) && ( player.skills.hacking < hack_cap || prioritize_xp ) && initialized < 1 ) {
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

