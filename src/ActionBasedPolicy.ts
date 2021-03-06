import {
  ActionBasedType,
  ConditionResolver,
  EvaluateActionBasedInterface,
  ProxyOptions
} from './types';
import { ActionBased } from './ActionBasedStatement';
import { Policy } from './Policy';

export interface ActionBasedPolicyInterface<T extends object> {
  statements: ActionBasedType[];
  conditionResolver?: ConditionResolver;
  context?: T;
}

export class ActionBasedPolicy<T extends object> extends Policy<
  T,
  ActionBasedType
> {
  private denyStatements: ActionBased<T>[];
  private allowStatements: ActionBased<T>[];
  private statements: ActionBasedType[];

  constructor({
    statements,
    conditionResolver,
    context
  }: ActionBasedPolicyInterface<T>) {
    super({ context, conditionResolver });
    const statementInstances = statements.map(
      (statement) => new ActionBased(statement)
    );
    this.allowStatements = statementInstances.filter(
      (s) => s.effect === 'allow'
    );
    this.denyStatements = statementInstances.filter((s) => s.effect === 'deny');
    this.statements = statementInstances.map((statement) =>
      statement.getStatement()
    );
  }

  addStatement(this: ActionBasedPolicy<T>, statement: ActionBasedType): void {
    const statementInstance = new ActionBased(statement);
    if (statementInstance.effect === 'allow') {
      this.allowStatements.push(statementInstance);
    } else {
      this.denyStatements.push(statementInstance);
    }
    this.statements.push(statementInstance.getStatement());
  }

  getStatements(this: ActionBasedPolicy<T>): ActionBasedType[] {
    return this.statements;
  }

  evaluate(
    this: ActionBasedPolicy<T>,
    { action, context }: EvaluateActionBasedInterface<T>
  ): boolean {
    const args = { action, context };
    return !this.cannot(args) && this.can(args);
  }

  can(
    this: ActionBasedPolicy<T>,
    { action, context }: EvaluateActionBasedInterface<T>
  ): boolean {
    return this.allowStatements.some((s) =>
      s.matches({
        action,
        context: context || this.context,
        conditionResolver: this.conditionResolver
      })
    );
  }

  cannot(
    this: ActionBasedPolicy<T>,
    { action, context }: EvaluateActionBasedInterface<T>
  ): boolean {
    return this.denyStatements.some((s) =>
      s.matches({
        action,
        context: context || this.context,
        conditionResolver: this.conditionResolver
      })
    );
  }

  generateProxy<U extends object, W extends keyof U>(
    this: ActionBasedPolicy<T>,
    obj: U,
    options: ProxyOptions = {}
  ): U {
    const { get = {}, set = {} } = options;
    const { allow: allowGet = true, propertyMap: propertyMapGet = {} } = get;
    const { allow: allowSet = true, propertyMap: propertyMapSet = {} } = set;
    const handler = {
      ...(allowGet
        ? {
            get: (target: U, prop: W): any => {
              if (prop in target) {
                if (typeof prop === 'string') {
                  const property = propertyMapGet[prop] || prop;
                  if (this.evaluate({ action: property })) return target[prop];
                  throw new Error(`Unauthorize to get ${prop} property`);
                }
              }
              return target[prop];
            }
          }
        : {}),
      ...(allowSet
        ? {
            set: (target: U, prop: W, value: any): boolean => {
              if (typeof prop === 'string') {
                const property = propertyMapSet[prop] || prop;
                if (this.evaluate({ action: property })) {
                  target[prop] = value;
                  return true;
                } else throw new Error(`Unauthorize to set ${prop} property`);
              }
              return true;
            }
          }
        : {})
    };

    return new Proxy(obj, handler);
  }
}
