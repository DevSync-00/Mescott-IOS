import React, { useMemo, useState, useEffect } from 'react'
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Colors from '../constants/Colors'
import { CATEGORIES } from '../constants/Categories'

interface CategorySearchSheetProps {
  visible: boolean
  onClose: () => void
  onSelectCategory: (name: string) => void
}

export default function CategorySearchSheet({ visible, onClose, onSelectCategory }: CategorySearchSheetProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (visible) setQuery('')
  }, [visible])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES.filter(c => c.name.toLowerCase().includes(q))
  }, [query])

  if (!visible) return null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.neutral[600]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Services</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.neutral[400]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories..."
            placeholderTextColor={Colors.neutral[400]}
            style={styles.searchInput}
            autoFocus
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => onSelectCategory(item.name)}>
              <View style={[styles.avatar, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={(item.icon as any) || 'pricetag'} size={18} color={Colors.primary[500]} />
              </View>
              <Text style={styles.itemText}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.neutral[400]} />
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
    backgroundColor: Colors.background.primary,
  },
  closeButton: { padding: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[800],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border.primary,
    margin: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[900],
    marginLeft: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border.primary,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[800],
    fontWeight: '600',
  },
})


