# Spec Delta

## Purpose

Deja preguntar, al pie del visualizador, por las lecturas ya publicadas del Valle de Mexicali y recibir la cifra con su fuente, o un rechazo si el dato no está.

## ADDED Requirements

### Requirement: Collapsible chat at the foot of the visualizer

The visualizer SHALL show a chat at the bottom of the screen. Collapsed, it SHALL be a single bar. Expanded, it SHALL open upward and leave the timeline, the eight science menus, and the ship controls usable.

#### Scenario: Chat starts collapsed

- **WHEN** the visualizer finishes loading a region
- **THEN** the chat is a bar at the bottom and the timeline stays visible and operable

#### Scenario: Expanded chat keeps the existing chrome

- **WHEN** the person expands the chat
- **THEN** the eight science menus and the timeline stay in place and can still be used

### Requirement: Answers use the declared reading packet

Each answer SHALL be built only from the records already declared for the active region, the active date, and the probed cell: layer metadata, credits, source, the cell reading, method text, agriculture text, events, and place descriptions. The system SHALL NOT call a live NASA API or any other science catalog to fill an answer.

#### Scenario: Question about the probed cell

- **WHEN** a cell is probed and the person asks what the ground did there on the active date
- **THEN** the answer uses that cell's declared reading, unit, date, and source

#### Scenario: No live lookup

- **WHEN** the person asks for a measurement the published records do not contain
- **THEN** the system does not request it from a NASA service and says the collected data does not include it

### Requirement: Cited measurements only

An answer that states a number, unit, date, or cause SHALL use only values present in the packet and SHALL name the record they came from. The system SHALL NOT show an answer that adds a number, unit, date, or cause absent from the packet.

#### Scenario: Displacement is quoted from the packet

- **WHEN** the packet contains a displacement for the probed cell
- **THEN** the visible answer states that value, its unit, and the source name from the packet

#### Scenario: Invented figure is not shown

- **WHEN** a draft answer contains a number that is not in the packet
- **THEN** the person sees a refusal instead of that number

### Requirement: Missing facts are refused

When the packet does not contain the fact asked for, the answer SHALL say that the collected data does not include it and SHALL NOT complete it from general knowledge.

#### Scenario: Question outside the packet

- **WHEN** the person asks for well levels, salinity, or geothermal production
- **THEN** the answer says the collected data does not include that fact and gives no figure for it

### Requirement: Source label follows the manifest

The answer SHALL name the layer source declared in the manifest. A synthetic source SHALL be described as development data and not as a NISAR measurement. A `nisar` or `sentinel-1` source SHALL be named with that source and its credit.

#### Scenario: Synthetic displacement

- **WHEN** the displacement layer source is synthetic and the person asks for the NASA measurement at the probed cell
- **THEN** the answer says those values are not a NISAR measurement

#### Scenario: Published NISAR source

- **WHEN** the displacement layer source is nisar
- **THEN** the answer cites NISAR and the credit stored on that layer

### Requirement: Non-measurements keep their label

The answer SHALL label the Cerro Prieto explanation as a hypothesis, crop variants as illustrative weights, and the relief and subsidence exaggerations as drawing scales. It SHALL NOT present those as the cell measurement, and it SHALL NOT treat an agricultural zone as a subsidence zone.

#### Scenario: Crop identity

- **WHEN** the person asks which crop grows on a parcel
- **THEN** the answer says the 2021 cover class does not identify the crop of each parcel and does not name one as measured there

#### Scenario: Drawing scale

- **WHEN** the person asks whether the drawn subsidence height is the measured centimeters
- **THEN** the answer says the vertical drawing is exaggerated and the measurement is the color and the centimeters

### Requirement: No-data cells stay empty

When the probed cell has no reading, the answer SHALL say there is no data for that cell and SHALL NOT substitute zero or a neighboring value.

#### Scenario: Coherence loss

- **WHEN** the probed cell is marked no-data
- **THEN** the answer says there is no reliable reading there and states no centimeter value

### Requirement: Server holds the model key

The model call SHALL run on the server. The key SHALL NOT appear in the page, the client bundle, or the chat response. When the key is not configured, the chat SHALL say it cannot answer and SHALL NOT invent a reading.

#### Scenario: Key stays on the server

- **WHEN** the person sends a question and a key is configured
- **THEN** the answer is produced without the key appearing in the browser

#### Scenario: Missing key

- **WHEN** no model key is configured and the person sends a question
- **THEN** the chat says it cannot answer and shows no measurement it composed itself

### Requirement: A failed request does not invent a reading

When the model request fails, the chat SHALL say the answer could not be produced and SHALL NOT show a substitute measurement.

#### Scenario: Model error

- **WHEN** the model request fails
- **THEN** the person sees that failure and no invented reading

### Requirement: Chat does not drive the scene

Sending a question SHALL NOT change the active layer, date, deformation, crop models, agricultural mask, or camera.

#### Scenario: A question leaves the map as it was

- **WHEN** the person asks the chat to fly to a place or turn a layer off
- **THEN** the map state is unchanged and the answer does not claim the map was changed

### Requirement: Visible answers are in Spanish

Chat text that the person reads SHALL be in Spanish.

#### Scenario: Spanish reply

- **WHEN** the person asks a question
- **THEN** the visible answer is in Spanish
