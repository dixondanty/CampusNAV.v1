import { useEffect, useId, useMemo, useRef, useState } from 'react'

function SearchableLocationSelect({
  groups,
  value,
  excludedValue,
  onChange,
  placeholder,
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)
  const listboxId = useId()

  const visibleGroups = useMemo(() => {
    const searchText = search.trim().toLocaleLowerCase()
    return groups
      .map((group) => ({
        ...group,
        nodes: group.nodes.filter((node) =>
          String(node._id) !== excludedValue &&
          String(node.displayLabel || node.name || '').trim().toLocaleLowerCase().includes(searchText),
        ),
      }))
      .filter((group) => group.nodes.length > 0)
  }, [excludedValue, groups, search])
  const visibleNodes = visibleGroups.flatMap((group) => group.nodes)
  const selectedLocation = groups
    .flatMap((group) => group.nodes.map((node) => ({ node, floorName: group.name })))
    .find(({ node }) => String(node._id) === value)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handleOutsidePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
        setSearch('')
        setActiveIndex(-1)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [isOpen])

  function openSelector() {
    if (!isOpen) {
      setSearch('')
      setActiveIndex(-1)
    }
    setIsOpen(true)
  }

  function selectLocation(node) {
    onChange(String(node._id))
    setSearch('')
    setIsOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openSelector()
      setActiveIndex((currentIndex) => {
        if (visibleNodes.length === 0) return -1
        if (event.key === 'ArrowDown') {
          return currentIndex < 0 ? 0 : (currentIndex + 1) % visibleNodes.length
        }
        return currentIndex < 0
          ? visibleNodes.length - 1
          : (currentIndex - 1 + visibleNodes.length) % visibleNodes.length
      })
    } else if (event.key === 'Enter' && isOpen && visibleNodes.length > 0) {
      event.preventDefault()
      selectLocation(visibleNodes[activeIndex < 0 ? 0 : activeIndex])
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      setIsOpen(false)
      setSearch('')
      setActiveIndex(-1)
    }
  }

  return (
    <div
      className="searchable-location"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
          setSearch('')
          setActiveIndex(-1)
        }
      }}
      ref={containerRef}
    >
      <div className="searchable-location-input-wrap">
        <input
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          autoComplete="off"
          className="searchable-location-input"
          onChange={(event) => {
            setSearch(event.target.value)
            setActiveIndex(-1)
            setIsOpen(true)
          }}
          onFocus={openSelector}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          value={isOpen ? search : selectedLocation
            ? `${selectedLocation.node.displayLabel || selectedLocation.node.name} · ${selectedLocation.floorName}`
            : ''}
        />
        {(search || selectedLocation) && (
          <button
            aria-label="Clear search text"
            className="searchable-location-clear"
            onClick={() => {
              setSearch('')
              setActiveIndex(-1)
              setIsOpen(true)
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            ×
          </button>
        )}
      </div>
      {isOpen && (
        <div
          className="searchable-location-options"
          id={listboxId}
          role="listbox"
        >
          {visibleGroups.length === 0 ? (
            <p className="searchable-location-empty">No locations found</p>
          ) : (
            visibleGroups.map((group) => (
              <div className="searchable-location-group" key={group.id}>
                <p className="searchable-location-group-name">{group.name}</p>
                {group.nodes.map((node) => {
                  const index = visibleNodes.findIndex((item) => item._id === node._id)
                  return (
                    <button
                      aria-selected={String(node._id) === value}
                      className={`searchable-location-option${index === activeIndex ? ' is-active' : ''}`}
                      key={node._id}
                      onClick={() => selectLocation(node)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      <span>{node.displayLabel || node.name}</span>
                      <small>{group.name}</small>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SearchableLocationSelect
