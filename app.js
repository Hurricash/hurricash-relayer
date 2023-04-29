require("dotenv").config();
const Web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");

// REST API
const express = require("express");
const cors = require("cors");
const asyncHandler = require("express-async-handler");
const bodyParser = require("body-parser");
const app = express();
const port = process.env.PORT || 3001;

// ECC
const BN = require("bn.js");
const { strTo64BN, bn128 } = require("./utils/AltBn128.js");
const bnZero = new BN("0", 10);

// Get web3
const customProvider = new HDWalletProvider(
  [process.env.ETH_SK],
  `https://rpc.v4.testnet.pulsechain.com` //pulsechain testnet v4 rpc
);
const web3 = new Web3(customProvider);

//declare contract variables
const { abi } = require('./contracts/Hurricash.json');
const HurricashContract = new web3.eth.Contract(abi, '0x134EDbA3cAC3A59a7B0E2D40A944F9B5c0383EFd'); //0x20D302e3B315AF15ebAd1dBADE3B800DF33f3fC2 ropsten testnet

// Check Environment variables
let hasEnv = true;

if (process.env.ETH_SK === undefined) {
  hasEnv = false;
  console.log("Missing Env variable: ETH_SK");
}
if (hasEnv === false) {
  process.exit(1);
}


// Middlewares
app.use(bodyParser.json());
app.use(cors());

// Relayer logic
app.post(
  "/",
  asyncHandler(async (req, res) => {
    // Set timeout (10 mins max)
    req.setTimeout(600000);

    const postParams = req.body;

    // Debug
    console.log(`Request received: ${JSON.stringify(postParams)}`);

    // Extract out post params
    const {
      message,
      signedMessage,
      receiver,
      ethAmount,
      ringIdx,
      c0,
      keyImage,
      s,
    } = postParams;

    
    if (
      message === undefined ||
      signedMessage === undefined ||
      receiver === undefined ||
      ethAmount === undefined ||
      ringIdx === undefined ||
      c0 === undefined ||
      keyImage === undefined ||
      s === undefined
    ) {
      res.status(400).send({
        errorMessage: "Invalid payload1",
        txHash: null
      });
      return;
    }
    

    const accounts = await web3.eth.getAccounts();
    const sender = accounts[0];

    // Make sure sender authorized this tx
    const signatureAddress = await web3.eth.personal.ecRecover(
      message,
      signedMessage
    );

    if (
      signatureAddress.toLowerCase() !== receiver.toLowerCase() ||
      message.toLowerCase().indexOf(receiver.toLowerCase()) === -1
    ) {
      res.status(400).send({
        errorMessage: "Invalid Message Signature",
        txHash: null,
      });
      return;
    }

    // Verify signature before sending it of to the EVM
    // (saves GAS if invalid tx that way)
    // Checks if ring is closed
    
    console.log("ring hash process start");
    const ringHash = await HurricashContract.methods.getRingHash(ethAmount, ringIdx).call();
    console.log("ring hash", ringHash);
    
    const ringHashBuf = Buffer.from(
      ringHash.slice(2), // Remove the '0x'
      "hex"
    );
    const ethAddressBuf = Buffer.from(
      receiver.slice(2), // Remove the '0x'
      "hex"
    );
    const msgBuf = Buffer.concat([ringHashBuf, ethAddressBuf]);

    const publicKeys = await HurricashContract.methods.getPublicKeys(ethAmount, ringIdx).call();

    const publicKeysBN = publicKeys
      .map((x) => {
        return [
          // Slice the '0x'
          new BN(Buffer.from(x[0].slice(2), "hex")),
          new BN(Buffer.from(x[1].slice(2), "hex")),
        ];
      })
      .filter((x) => x[0].cmp(bnZero) !== 0 && x[1].cmp(bnZero) !== 0);

    const ringSignature = [
      strTo64BN(c0),
      s.map((x) => strTo64BN(x)),
      [strTo64BN(keyImage[0]), strTo64BN(keyImage[1])],
    ];

    const validRingSig = bn128.ringVerify(msgBuf, publicKeysBN, ringSignature);

    if (!validRingSig) {
      console.log(`Invalid Ring Signature: ${JSON.stringify(postParams)}`);
      res.status(400).send({
        errorMessage: "Invalid Ring Signature",
        txHash: null,
      });
      return;
    }

    // Convert to bytecode to estimate GAS
    let dataBytecode;
    try {
      dataBytecode = HurricashContract.methods.withdraw(receiver, ethAmount, ringIdx, c0, keyImage, s).encodeABI();
    } catch (e) {
      console.log(e);
      console.log(`Invalid payload2: ${JSON.stringify(postParams)}`);
      res.status(400).send({
        errorMessage: "Payload invalid format",
        txHash: null,
      });
      return;
    }

    // Passes in-built checks, time to estimate GAS
    let gas;
    try {
      // If estimating the gas throws an error
      // then likely invalid params (i.e. ringIdx is closed or user deposited or keys not valid)
      gas = await web3.eth.estimateGas({
        to: HurricashContract._address,
        data: dataBytecode,
      });
    } catch (e) {
      console.log(`EVM revert: ${JSON.stringify(postParams)}`);
      res.status(400).send({
        errorMessage:
          "EVM revert on GAS estimation (likely invalid input params).",
        txHash: null,
      });
      return;
    }

    const tx = {
      from: sender,
      to: HurricashContract._address,
      gas,
      data: dataBytecode,
      nonce: await web3.eth.getTransactionCount(sender),
    };


    // txR has response type of
    /**
     * { blockHash: string,
     *   blockNumber: number,
     *   contractAddress: Maybe string,
     *   cumulativeGasUsed: 1325121,
     *   from: string,
     *   gasUsed: number,
     *   logs: [events],
     *   logsBloom: string,
     *   status: boolean,
     *   to: string,
     *   transactionHash: string,
     *   transactionIndex: number }
     */

    // Try and send transaction
    console.log("Sending tx...");
    try {
      const txR = await web3.eth.sendTransaction(tx);
      res.status(200).send({
        txHash: txR.transactionHash,
      });
    } catch (e) {
      const txR = JSON.parse(e.message.split(":").slice(1).join(":"));

      res.status(200).send({
        errorMessage: e.message.split(":").slice(0, 1),
        txHash: txR.transactionHash,
      });
    }
    console.log("Tx sent...");
  })
);

console.log(`Listening on port ${port}`);

app.listen(port, "0.0.0.0");
