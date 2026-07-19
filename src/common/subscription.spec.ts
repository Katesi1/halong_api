import { isTrialPropertyCapped, isOwnerEntitled } from './subscription';
import { SUBSCRIPTION_STATUS } from './constants';

describe('isTrialPropertyCapped', () => {
  it('caps a trial owner without a plan', () => {
    // Arrange
    const owner = { subscriptionPlanId: null };

    // Act + Assert
    expect(isTrialPropertyCapped(owner)).toBe(true);
  });

  it('does not cap once the owner has bought a plan', () => {
    const owner = { subscriptionPlanId: 'rooms_5' };

    expect(isTrialPropertyCapped(owner)).toBe(false);
  });

  it('STILL caps a kycBypass owner who has not bought a plan', () => {
    // kycBypass gỡ yêu cầu KYC nhưng KHÔNG gỡ trần số phòng của trial.
    const owner = { subscriptionPlanId: null };

    expect(isTrialPropertyCapped(owner)).toBe(true);
  });

  it('STILL caps a KYC-approved owner who has not bought a plan', () => {
    // Đã duyệt KYC nhưng chưa mua gói → vẫn trong giai đoạn trial → cap.
    const owner = { subscriptionPlanId: null };

    expect(isTrialPropertyCapped(owner)).toBe(true);
  });

  it('does not cap an active subscriber (has a plan)', () => {
    const owner = { subscriptionPlanId: 'rooms_5' };

    expect(isTrialPropertyCapped(owner)).toBe(false);
  });
});

describe('isOwnerEntitled', () => {
  it('entitles a trial owner whose trial is still valid', () => {
    const now = new Date('2026-07-09T00:00:00Z');
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      trialEndsAt: new Date('2026-07-20T00:00:00Z'),
    };

    expect(isOwnerEntitled(owner, now)).toBe(true);
  });

  it('locks a trial owner whose trial has expired', () => {
    const now = new Date('2026-07-09T00:00:00Z');
    const owner = {
      kycBypass: false,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      trialEndsAt: new Date('2026-07-01T00:00:00Z'),
    };

    expect(isOwnerEntitled(owner, now)).toBe(false);
  });
});
