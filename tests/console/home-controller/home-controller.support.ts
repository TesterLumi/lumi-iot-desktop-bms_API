import { test as base } from '@playwright/test'
import { homeControllerFixture, HomeControllerFixture } from '@src/core'
import { combineFixtures } from '@src/utils'

export const consoleServiceTest = base.extend<HomeControllerFixture>(
  combineFixtures(homeControllerFixture),
)
