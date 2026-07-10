import { faker } from '@faker-js/faker'
import {
  HomeControllerCreateRequest,
  HomeControllerUpdateRequest,
} from './type'

export const createHomeControllerData = (): HomeControllerCreateRequest => ({
  mac: faker.internet.mac(),
  name: faker.word.words(3),
  ip: faker.internet.ipv4({ cidrBlock: '10.8.0.0/8' }),
})

export const updateHomeControllerData = (): HomeControllerUpdateRequest => ({
  name: faker.word.words(3),
  notes: faker.lorem.sentence({ min: 2, max: 6 }),
})
