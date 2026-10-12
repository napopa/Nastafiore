import AsyncStorage from '@react-native-async-storage/async-storage'
import { createIntegrationStore } from './integrations'

export const integrationStore = createIntegrationStore({ storage: AsyncStorage, platform: 'web' })
