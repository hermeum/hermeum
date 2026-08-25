import { Router } from "express";

import { mapHermesAgent } from "../infras/kubernetes/client.js";
import { HermesAgent } from "../infras/kubernetes/types/hermes-agent.js";
import { AgentUseCase } from "../usecases/agent.js";

type AdmissionOperation = "CREATE" | "UPDATE" | "DELETE" | "CONNECT";

interface AdmissionRequest {
  uid: string;
  operation: AdmissionOperation;
  kind: { group: string; version: string; kind: string };
  object?: HermesAgent;
}

interface AdmissionReview {
  apiVersion: string;
  kind: "AdmissionReview";
  request?: AdmissionRequest;
  response?: {
    uid: string;
    allowed: boolean;
    patchType?: "JSONPatch";
    patch?: string;
  };
}

const usecase = new AgentUseCase();

export const webhookRouter = Router();

webhookRouter.post("/mutating", async (req, res) => {
  const body = req.body as AdmissionReview;
  const request = body.request;

  if (!request) {
    res.status(400).json({ error: "Missing admission request" });
    return;
  }

  if (
    request.kind.kind !== "HermesAgent" ||
    request.operation === "DELETE" ||
    request.operation === "CONNECT" ||
    !request.object
  ) {
    res.json({
      apiVersion: body.apiVersion,
      kind: "AdmissionReview",
      response: { uid: request.uid, allowed: true },
    });
    return;
  }

  const agent = mapHermesAgent(request.object);
  const patch = await usecase.getmutatingWebhookJsonPatch(agent);

  const response: AdmissionReview = {
    apiVersion: body.apiVersion,
    kind: "AdmissionReview",
    response: {
      uid: request.uid,
      allowed: true,
      ...(patch !== null && {
        patchType: "JSONPatch",
        patch: Buffer.from(JSON.stringify(patch)).toString("base64"),
      }),
    },
  };

  res.json(response);
});
