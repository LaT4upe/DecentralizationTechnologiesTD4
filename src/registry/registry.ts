import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());


  // TODO implement the status route
  const nodes: Node[] = [];

  _registry.get("/status", (req, res) => {
    res.send("live");
  });



  _registry.post("/registerNode", (req, res) => {
    const { nodeId, pubKey } = req.body as RegisterNodeBody;
    nodes.push({ nodeId, pubKey });
    res.send("success");
  });


  _registry.get("/getNodeRegistry", (req, res) => {
    res.json({ nodes });
  });


  _registry.get("/getPrivateKey", (req, res) => {
    res.json({ nodes });
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log('registry is listening on port ${REGISTRY_PORT}');
  });

  return server;
}
