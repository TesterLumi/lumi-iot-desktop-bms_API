import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export class ContainerRuntime {
  private constructor() {}
  private static _instance: ContainerRuntime
  public static getInstance(): ContainerRuntime {
    if (!ContainerRuntime._instance) {
      ContainerRuntime._instance = new ContainerRuntime()
    }
    return ContainerRuntime._instance
  }

  startContainer = async (name: string): Promise<void> => {
    await execAsync(`docker start ${name}`)
  }

  stopContainer = async (name: string): Promise<void> => {
    await execAsync(`docker stop ${name}`)
  }
}
