import { Router } from "express";

import { mapOpenClawInstance } from "../infras/kubernetes/client.js";
import { OpenClawInstance } from "../infras/kubernetes/types/openclaw-instance.js";
import { InstanceUseCase } from "../usecases/instance.js";

type AdmissionOperation = "CREATE" | "UPDATE" | "DELETE" | "CONNECT";

interface AdmissionRequest {
  uid: string;
  operation: AdmissionOperation;
  kind: { group: string; version: string; kind: string };
  object?: OpenClawInstance;
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

const usecase = new InstanceUseCase();

export const webhookRouter = Router();

webhookRouter.post("/mutating", (req, res) => {
  const body = req.body as AdmissionReview;
  const request = body.request;

  if (!request) {
    res.status(400).json({ error: "Missing admission request" });
    return;
  }

  if (request.kind.kind !== "OpenClawInstance" || request.operation === "DELETE" || request.operation === "CONNECT" || !request.object) {
    res.json({
      apiVersion: body.apiVersion,
      kind: "AdmissionReview",
      response: { uid: request.uid, allowed: true },
    });
    return;
  }

  const instance = mapOpenClawInstance(request.object);
  const patch = usecase.getMutatingJsonPatch(instance);

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
