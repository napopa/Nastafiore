import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { createIntegrationStore } from './integrations'

export const integrationStore = createIntegrationStore({ storage: AsyncStorage, platform: 'android', secretStorage: { getItem: SecureStore.getItemAsync, setItem: SecureStore.setItemAsync, removeItem: SecureStore.deleteItemAsync } })
