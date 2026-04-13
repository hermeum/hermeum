import { TrpcClient } from "./infras/trpc";
import { InstanceUseCase } from "./usecases/instance";
import { TemplateUseCase } from "./usecases/template";

const api = new TrpcClient();

export const instanceUseCase = new InstanceUseCase(api);
export const templateUseCase = new TemplateUseCase(api);
