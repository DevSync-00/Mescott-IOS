import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import Colors from '../constants/Colors'

interface JobsHeaderProps {
  title: string
  subtitle: string
  onCreateTask: () => void
  createTaskText: string
}

export default function JobsHeader({
  title,
  subtitle,
  onCreateTask,
  createTaskText
}: JobsHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.createTaskButton}
            onPress={onCreateTask}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createTaskText}>{createTaskText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.neutral[600],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  createTaskText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
})
