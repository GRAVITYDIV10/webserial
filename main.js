"use strict";

function term_handler(str) {
	serial_txs(str);
}

var term = new Term(80, 30, 10000, 12);
term.setKeyHandler(term_handler);
term.open(document.getElementById("term_container"),
	  document.getElementById("term_paste"));

var term_wrap_el = document.getElementById("term_wrap")
term_wrap_el.style.width = term.term_el.style.width;

var comport = undefined;

var state = document.getElementById("state");

var baud;
var baud_el = document.getElementById("baudrate");
var databits;
var databits_el = document.getElementById("databits");
var stopbits;
var stopbits_el = document.getElementById("stopbits");

var parity_el = document.getElementById("parity");
var flow_control_el = document.getElementById("flow_control");

var rx_run = false;
var rx_log = undefined; 

async function serial_logrx() {
	try {
		let fhandle = await window.showSaveFilePicker();
		rx_log = await fhandle.createWritable();
		state.value = "PORT RX LOG OPEN OK";
	} catch (e) {
		state.value = "PORT RX LOG OPEN FAILED";
		console.log(e);
		rx_log = undefined;
	}
}

var cts_el = document.getElementById("cts");
var dcd_el = document.getElementById("dcd");
var dsr_el = document.getElementById("dsr");
var ring_el = document.getElementById("ring");

async function serial_rx() {
	if (comport == undefined) {
		return;
	}
	try {
		rx_run = true;
		var reader = comport.readable.getReader();
		var decoder = new TextDecoder();
		while(rx_run) {
			const { value, done } = await reader.read();
			if (value) {
				term.write(decoder.decode(value));
				if (rx_log != undefined) {
					rx_log.write(decoder.decode(value));
				}
			}
			if (done) {
				reader.releaseLock();
				break;
			}
		}
		reader.releaseLock();
	} catch (e) {
		state.value = "PORT READ FAILED";
		console.log(e);
	}
}

var comport_signal = undefined;

var interval_signal_update;

async function serial_update_signal() {
	if (comport == undefined) {
		clearInterval(interval_signal_update);
		return;
	}
	comport_signal = await serial_signal_get();
	cts_el.value = comport_signal.clearToSend;
	dcd_el.value = comport_signal.dataCarrierDetect;
	dsr_el.value = comport_signal.dataSetReady;
	ring_el.value = comport_signal.ringIndicator;
}

async function serial_txs(str) {
	if (comport == undefined) {
		state.value = "PORT NOT OPEN";
		return;
	}
	try {
		var writer = comport.writable.getWriter();
		var encoder = new TextEncoder();
		await writer.write(encoder.encode(str));
		writer.releaseLock();
	} catch (e) {
		state.value = "PORT WRITE FAILED";
		console.log(e);
		writer.releaseLock();
	}
}

function lock_serial_params() {
	baud_el.disabled = true;
	databits_el.disabled = true;
	stopbits_el.disabled = true;
	parity_el.disabled = true;
	flow_control_el.disabled = true;
}

function unlock_serial_params() {
	baud_el.disabled = false;
	databits_el.disabled = false;
	stopbits_el.disabled = false;
	parity_el.disabled = false;
	flow_control_el.disabled = false;
}

async function serial_open() {
	serial_close();
	baud = baud_el.value;
	databits = databits_el.value;
	stopbits = stopbits_el.value;
	lock_serial_params();
	try {
		comport = await navigator.serial.requestPort();
		await comport.open({
			baudRate: baud,
			dataBits: databits,
			stopBits: stopbits,
			flowControl: flow_control_el.value,
			parity: parity_el.value,
		});
		comport.addEventListener("disconnect", (event) => {
			state.value = "PORT IS DISCONNECTED";
			comport = undefined;
		});
		state.value = "PORT OPEN OK";
		interval_signal_update = setInterval(serial_update_signal, 20);
		await serial_rx();
	} catch (e) {
		state.value = "PORT OPEN FAILED";
		console.log(e);
		comport = undefined;
	}
	unlock_serial_params();
}

async function serial_close() {
	if (comport == undefined) {
		state.value = "PORT IS CLOSED";
		return;
	}
	try {
		rx_run = false;
		await comport.forget();
		state.value = "PORT RELEASE OK";
		comport = undefined;
		if (rx_log != undefined) {
			await rx_log.close();
		}
	} catch (e) {
		state.value = "PORT RELEASE FAILED";
		console.log(e);
	}
	unlock_serial_params();
}

var paste_el = document.getElementById("paste");

async function serial_paste() {
	let paste = paste_el.value;
	serial_txs(paste);
}

var break_el = document.getElementById("break");
var rts_el = document.getElementById("rts");
var dtr_el = document.getElementById("dtr");

async function serial_break_toggle() {
	if (comport == undefined) {
		return;
	}
	if (break_el.textContent == "NOP") {
		break_el.textContent = "ON";
	}
	if (break_el.textContent == "ON") {
		await comport.setSignals( { break: false } );
		break_el.textContent = "OFF";
		return;
	}
	if (break_el.textContent == "OFF") {
		await comport.setSignals( { break: true } );
		break_el.textContent = "ON";
		return;
	}
}

async function serial_rts_toggle() {
	if (comport == undefined) {
		return;
	}
	if (rts_el.textContent == "NOP") {
		rts_el.textContent = "ON";
	}
	if (rts_el.textContent == "ON") {
		await comport.setSignals( { requestToSend : false } );
		rts_el.textContent = "OFF";
		return;
	}
	if (rts_el.textContent == "OFF") {
		await comport.setSignals( { requestToSend : true } );
		rts_el.textContent = "ON";
		return;
	}
}

async function serial_dtr_toggle() {
	if (comport == undefined) {
		return;
	}
	if (dtr_el.textContent == "NOP") {
		dtr_el.textContent = "ON";
	}
	if (dtr_el.textContent == "ON") {
		await comport.setSignals( { dataTerminalReady : false } );
		dtr_el.textContent = "OFF";
		return;
	}
	if (dtr_el.textContent == "OFF") {
		await comport.setSignals( { dataTerminalReady : true } );
		dtr_el.textContent = "ON";
		return;
	}
}

async function serial_signal_get() {
	if (comport == undefined) {
		return;
	}
	var ret;
	try {
		ret = await comport.getSignals();
	} catch (e) {
		console.log(e);
	}
	return ret;
}
