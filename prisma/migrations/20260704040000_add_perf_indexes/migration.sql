-- CreateIndex
CREATE INDEX "property_images_propertyId_idx" ON "property_images"("propertyId");

-- CreateIndex
CREATE INDEX "calendar_locks_propertyId_date_idx" ON "calendar_locks"("propertyId", "date");
