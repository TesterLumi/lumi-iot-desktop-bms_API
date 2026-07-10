import { JSONSchemaType } from 'ajv'
import {
  HomeController,
  HomeControllerCreateRequest,
  HomeControllerUpdateRequest,
} from './type'

export const homeControllerSchema: JSONSchemaType<HomeController> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  title: 'HomeController',
  properties: {
    id: {
      type: 'string',
    },
    mac: {
      type: 'string',
    },
    name: {
      type: 'string',
      nullable: true,
    },
    hc_type: {
      type: 'string',
      nullable: true,
    },
    version: {
      type: 'string',
      nullable: true,
    },
    ip: {
      type: 'string',
      nullable: true,
    },
    device_time: {
      type: 'integer',
      nullable: true,
    },
    time_zone: {
      type: 'string',
      nullable: true,
    },
    network_interface: {
      type: 'string',
      nullable: true,
    },
    lan_interface: {
      type: 'string',
      nullable: true,
    },
    wifi_interface: {
      type: 'string',
      nullable: true,
    },
    network_mode: {
      type: 'integer',
      nullable: true,
    },
    notes: {
      type: 'string',
      nullable: true,
    },
    created_at: {
      type: 'string',
      nullable: true,
    },
    updated_at: {
      type: 'string',
      nullable: true,
    },
    deleted_at: {
      type: 'string',
      nullable: true,
    },
    area: {
      type: 'string',
      nullable: true,
    },
    mqtt_status: {
      type: 'object',
      nullable: true,
      properties: {
        connected: {
          type: 'boolean',
        },
        last_event_at: {
          type: 'string',
          nullable: true,
        },
        last_connected_at: {
          type: 'string',
          nullable: true,
        },
        last_disconnected_at: {
          type: 'string',
          nullable: true,
        },
      },
      required: ['connected'],
    },
    automation_gateway: {
      type: 'boolean',
      nullable: true,
    },
  },
  required: ['id', 'mac'],
}

export const homeControllerCreateRequestSchema: JSONSchemaType<HomeControllerCreateRequest> =
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'HomeControllerCreateRequest',
    properties: {
      mac: {
        type: 'string',
      },
      name: {
        type: 'string',
        nullable: true,
      },
      hc_type: {
        type: 'string',
        nullable: true,
      },
      version: {
        type: 'string',
        nullable: true,
      },
      ip: {
        type: 'string',
        nullable: true,
      },
      device_time: {
        type: 'integer',
        nullable: true,
      },
      time_zone: {
        type: 'string',
        nullable: true,
      },
      network_interface: {
        type: 'string',
        nullable: true,
      },
      network_mode: {
        type: 'integer',
        nullable: true,
      },
      notes: {
        type: 'string',
        nullable: true,
      },
    },
    required: ['mac'],
  }

export const homeControllerUpdateRequestSchema: JSONSchemaType<HomeControllerUpdateRequest> =
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'HomeControllerUpdateRequest',
    properties: {
      name: {
        type: 'string',
        nullable: true,
      },
      notes: {
        type: 'string',
        nullable: true,
      },
    },
  }
