import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT } from "../config";
import { 
  createRandomSymmetricKey, 
  exportPubKey, 
  exportSymKey, 
  rsaEncrypt,
  symEncrypt
} from "../crypto";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { GetNodeRegistryBody, Node } from "../registry/registry";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

type MessageBody = {
  message: string;
};

type Circuit = number[];

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;

  let lastCircuit: Circuit | null = null;

  // TODO implement the status route
  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  _user.get("/getLastCircuit", (req, res) => {
    res.json({ result: lastCircuit });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body as MessageBody;
    lastReceivedMessage = message;
    res.send("success");
  });

  _user.post("/sendMessage", async (req, res) => {
    try {
      const { message, destinationUserId } = req.body as SendMessageBody;
      
      lastSentMessage = message;
      
      const nodes = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`)
        .then(res => res.json() as Promise<GetNodeRegistryBody>)
        .then(data => data.nodes);
      
      let circuit: Node[] = [];
      
      const nodeOrder = [0, 1, 2];
      for (const id of nodeOrder) {
        const node = nodes.find(n => n.nodeId === id);
        if (node) {
          circuit.push(node);
        }
      }
      
      // If we couldn't find all required nodes, fill with others
      if (circuit.length < 3) {
        const remaining = nodes.filter(n => !circuit.includes(n));
        while (circuit.length < 3 && remaining.length > 0) {
          const index = Math.floor(Math.random() * remaining.length);
          circuit.push(remaining[index]);
          remaining.splice(index, 1);
        }
      }
      
      lastCircuit = circuit.map(node => node.nodeId);
      
      const finalDestination = BASE_USER_PORT + destinationUserId;
      
      let finalDestinationStr = finalDestination.toString().padStart(10, '0');
      let currentContent = finalDestinationStr + message;
      
      for (let i = circuit.length - 1; i >= 0; i--) {
        const node = circuit[i];
        
        const symKey = await createRandomSymmetricKey();
        const symKeyStr = await exportSymKey(symKey);
        
        let nextDestination;
        if (i === circuit.length - 1) {
          // Last node in circuit should forward to the destination user
          nextDestination = finalDestination;
        } else {
          // Other nodes should forward to the next node in the circuit
          nextDestination = BASE_ONION_ROUTER_PORT + circuit[i + 1].nodeId;
        }
        
        const destinationStr = nextDestination.toString().padStart(10, '0');
        
        const encryptedWithSym = await symEncrypt(symKey, destinationStr + currentContent);
        
        const encryptedSymKey = await rsaEncrypt(symKeyStr, node.pubKey);
        
        currentContent = encryptedSymKey + encryptedWithSym;
      }
      
      const entryNodePort = BASE_ONION_ROUTER_PORT + circuit[0].nodeId;
      
      await fetch(`http://localhost:${entryNodePort}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: currentContent,
        }),
      });
      
      res.send("success");
    } catch (error) {
      console.error(`Error in user ${userId}:`, error);
      res.status(500).send("error");
    }
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  function createRandomCircuit(nodes: Node[], size: number): Node[] {
    if (nodes.length < size) {
      throw new Error(`Not enough nodes to create a circuit of size ${size}`);
    }
    
    const shuffled = [...nodes].sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, size);
  }

  return server;
}
