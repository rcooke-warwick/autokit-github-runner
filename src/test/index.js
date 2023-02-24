const Autokit = require('@balena/autokit');
const tap = require('tap');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');


const autokitConfig = {
    power: process.env.POWER || 'autokitRelay',
    sdMux: process.env.SD_MUX || 'linuxAut',
    network: process.env.NETWORK ||  'linuxNetwork',
    video: process.env.VIDEO || 'dummyVideo',
    serial: process.env.SERIAL || 'dummySerial',
    usbBootPort: process.env.USB_BOOT_PORT || '4',
    digitalRelay: process.env.DIGITAL_RELAY || 'dummyPower'
}


async function main(){
    // todo - make this dynamic. As we're running this in sudo, the envar isn't visible
    process.env.WIRED_IF='enp1s0u1u4'
    const autoKit = new Autokit.Autokit(autokitConfig)
    await autoKit.setup();
    tap.pass('Autokit initialised successfully')

    let version = await exec(`balena --version`);
    console.log(`balena-cli version: ${version.stdout}`);

    // download balenaOS image - add flag to not re-download
    console.log('Downloading balena os image...');
    
    try{
        let dl = await exec(`balena os download raspberrypi3 -o rpi3.img --version latest`)
        console.log(dl);
    } catch(e) {
        console.log(e)
        throw new Error(e)
    }
    
    // create a config.json
    const configJson = {
        developmentMode: true,
        uuid: 'abcdefg',
        localMode: true
    }

    console.log('Writing config to file...')
    await fs.promises.writeFile('config.json', JSON.stringify(configJson));
    console.log('Configuring balena os image...');
    let conf = await exec(`balena config inject config.json --drive rpi3.img`)
    console.log(conf);
    
    // flash it
    console.log('Powering off dut...')
    await autoKit.power.off();
    console.log('Flashing dut...')
    await autoKit.flash('rpi3.img', 'raspberrypi3');
    // set up network 
    console.log('Setting up network...')
    await autoKit.network.createWiredNetwork();

    console.log('Powering on dut...')
    // ssh in to host OS to confirm boot
    await autoKit.power.on();

    // try to ssh in - retry if fails
    for(let tries=0; tries < 20; tries++){
        try{
            // we need to find the ip of the dut. For an unmanaged device, "balena ssh <UUID>.local" fails withan auth error and requires a login 
            let ip = await exec("balena scan | grep -a1 'abcdefg.local' | grep address | awk -F ':' '{print $2}'")
            console.log(`IP of DUT is: ${ip.stdout.trim()}`)
            let res = await exec(`echo "uptime; exit;" | balena ssh ${ip.stdout.trim()}`);
            console.log(res)
            break
        } catch(e){
            console.log(e)
            console.log(`Failed to ssh in to device, attempt ${tries}  - retrying`);
        }
    }
    process.exit()
}

main();
