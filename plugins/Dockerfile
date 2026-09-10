FROM docker.elastic.co/kibana/kibana:8.11.3

# Copy the plugin zip into the container
COPY ./full_export/build/fullExport-8.11.3.zip /tmp/fullExport-8.11.3.zip

# Install the plugin using the Kibana CLI
RUN kibana-plugin install file:///tmp/fullExport-8.11.3.zip

