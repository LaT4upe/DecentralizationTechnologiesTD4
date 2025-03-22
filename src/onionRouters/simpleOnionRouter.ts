import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT } from "../config";
import { REGISTRY_PORT, BASE_USER_PORT } from "../config";
import { generateRsaKeyPair, exportPubKey, exportPrvKey, rsaDecrypt, symDecrypt } from "../crypto";
import { webcrypto } from "crypto";


export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());


  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;

  // TODO implement the status route


  const { publicKey, privateKey } = await generateRsaKeyPair();
  const pubKeyStr = await exportPubKey(publicKey);
  const prvKeyStr = await exportPrvKey(privateKey);

  await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nodeId,
      pubKey: pubKeyStr,
    }),
  });


  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({result: lastReceivedEncryptedMessage});
  })

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
       res.json({result: lastReceivedDecryptedMessage});
  })


  onionRouter.get("/getLastMessageDestination", (req, res) => {
       res.json({result: lastMessageDestination});
  })


  onionRouter.get("/getPrivateKey", (req, res) => {
    res.json({ result: prvKeyStr });
  });



  onionRouter.post("/message", async (req, res) => {
    const { message } = req.body;
    
    // Store the received encrypted message
    lastReceivedEncryptedMessage = message;
    
    try {
      const rsaEncryptedSymKey = message.substring(0, 344);
      const encryptedData = message.substring(344);
      
      const symKey = await rsaDecrypt(rsaEncryptedSymKey, privateKey);
      
      const decryptedMessage = await symDecrypt(symKey, encryptedData);
      
      lastReceivedDecryptedMessage = decryptedMessage;
      
      const destinationStr = decryptedMessage.substring(0, 10);
      const destination = parseInt(destinationStr);
      
      lastMessageDestination = destination;
      
      const messageToForward = decryptedMessage.substring(10);
      
      await fetch(`http://localhost:${destination}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: destination >= BASE_USER_PORT ? 
                  (messageToForward.includes("Hello World!") ? "Hello World!" : 
                   messageToForward.substring(messageToForward.indexOf("Hello World!"))) : 
                  decryptedMessage
        }),
      });
      
      res.send("success");
    } catch (error) {
      console.error(`Error in node ${nodeId}:`, error);
      res.status(500).send("error");
    }
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}
